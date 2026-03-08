import { join } from "node:path";

import {
  type ResolvedServiceOptions,
  type ServiceBackend,
  fileExists,
  homePath,
  quoteSystemdWord,
  removeFile,
  runCommand,
  writeTextFile,
} from "./internal";

export class LinuxBackend implements ServiceBackend {
  async register(definition: ResolvedServiceOptions): Promise<void> {
    await writeTextFile(this.unitPath(definition), renderSystemdUnit(definition));
    await runCommand("systemctl", this.systemctlArgs(definition, "daemon-reload"));

    if (definition.boot) {
      await runCommand("systemctl", this.systemctlArgs(definition, "enable", definition.name));
    } else {
      await runCommand("systemctl", this.systemctlArgs(definition, "disable", definition.name), {
        allowFailure: true,
      });
    }
  }

  async unregister(definition: ResolvedServiceOptions): Promise<void> {
    await this.stop(definition);
    await runCommand("systemctl", this.systemctlArgs(definition, "disable", definition.name), {
      allowFailure: true,
    });
    await removeFile(this.unitPath(definition));
    await runCommand("systemctl", this.systemctlArgs(definition, "daemon-reload"));
  }

  async start(definition: ResolvedServiceOptions): Promise<void> {
    await runCommand("systemctl", this.systemctlArgs(definition, "start", definition.name));
  }

  async stop(definition: ResolvedServiceOptions): Promise<void> {
    await runCommand("systemctl", this.systemctlArgs(definition, "stop", definition.name), {
      allowFailure: true,
    });
  }

  async restart(definition: ResolvedServiceOptions): Promise<void> {
    if ((await this.status(definition)) === "missing") {
      throw new Error(`Service "${definition.name}" is not registered.`);
    }

    await runCommand("systemctl", this.systemctlArgs(definition, "restart", definition.name));
  }

  async status(definition: ResolvedServiceOptions): Promise<"missing" | "registered" | "running"> {
    if (!(await fileExists(this.unitPath(definition)))) {
      return "missing";
    }

    const result = await runCommand(
      "systemctl",
      this.systemctlArgs(definition, "is-active", definition.name),
      { allowFailure: true },
    );

    return result.exitCode === 0 && result.stdout.trim() === "active" ? "running" : "registered";
  }

  private systemctlArgs(definition: ResolvedServiceOptions, ...args: string[]): string[] {
    return definition.scope === "user" ? ["--user", ...args] : args;
  }

  private unitPath(definition: ResolvedServiceOptions): string {
    return definition.scope === "user"
      ? homePath(".config", "systemd", "user", `${definition.name}.service`)
      : join("/etc", "systemd", "system", `${definition.name}.service`);
  }
}

export function renderSystemdUnit(definition: ResolvedServiceOptions): string {
  const execStart = [definition.command, ...definition.args].map(quoteSystemdWord).join(" ");
  const environmentLines = Object.entries(definition.env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `Environment=${quoteSystemdWord(`${key}=${value}`)}`);

  return [
    "[Unit]",
    `Description=${definition.description ?? definition.name}`,
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${execStart}`,
    definition.cwd ? `WorkingDirectory=${quoteSystemdWord(definition.cwd)}` : undefined,
    `Restart=${toSystemdRestart(definition.restart)}`,
    "RestartSec=1",
    ...environmentLines,
    "",
    "[Install]",
    `WantedBy=${definition.scope === "user" ? "default.target" : "multi-user.target"}`,
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function toSystemdRestart(restart: ResolvedServiceOptions["restart"]): string {
  switch (restart) {
    case "always":
      return "always";
    case "on-failure":
      return "on-failure";
    case "never":
      return "no";
  }
}
