import { join } from "node:path";

import {
  type ResolvedServiceOptions,
  type ServiceBackend,
  fileExists,
  homePath,
  removeFile,
  runCommand,
  writeTextFile,
  xmlEscape,
} from "./internal";

export class MacOSBackend implements ServiceBackend {
  async register(definition: ResolvedServiceOptions): Promise<void> {
    await writeTextFile(this.filePath(definition), renderLaunchdPlist(definition));
    await removeFile(this.alternatePath(definition));
  }

  async unregister(definition: ResolvedServiceOptions): Promise<void> {
    await this.stop(definition);
    await removeFile(this.filePath(definition));
    await removeFile(this.alternatePath(definition));
  }

  async start(definition: ResolvedServiceOptions): Promise<void> {
    if ((await this.status(definition)) === "running") {
      await runCommand("launchctl", ["kickstart", "-k", this.target(definition)]);
      return;
    }

    await runCommand("launchctl", ["bootstrap", this.domain(definition), this.filePath(definition)]);
  }

  async stop(definition: ResolvedServiceOptions): Promise<void> {
    await runCommand("launchctl", ["bootout", this.target(definition)], {
      allowFailure: true,
    });
  }

  async restart(definition: ResolvedServiceOptions): Promise<void> {
    if ((await this.status(definition)) === "missing") {
      throw new Error(`Service "${definition.name}" is not registered.`);
    }

    const running = (await this.status(definition)) === "running";

    if (running) {
      await runCommand("launchctl", ["kickstart", "-k", this.target(definition)]);
      return;
    }

    await this.start(definition);
  }

  async status(definition: ResolvedServiceOptions): Promise<"missing" | "registered" | "running"> {
    if (!(await fileExists(this.filePath(definition)))) {
      return "missing";
    }

    const result = await runCommand("launchctl", ["print", this.target(definition)], {
      allowFailure: true,
    });

    if (result.exitCode !== 0) {
      return "registered";
    }

    return /\bstate = running\b/.test(result.stdout) || /\bpid = \d+\b/.test(result.stdout)
      ? "running"
      : "registered";
  }

  private domain(definition: ResolvedServiceOptions): string {
    return definition.scope === "system" ? "system" : `gui/${process.getuid?.() ?? 0}`;
  }

  private target(definition: ResolvedServiceOptions): string {
    return `${this.domain(definition)}/${definition.name}`;
  }

  private filePath(definition: ResolvedServiceOptions): string {
    if (definition.scope === "system") {
      return join("/Library", "LaunchDaemons", `${definition.name}.plist`);
    }

    return definition.boot
      ? homePath("Library", "LaunchAgents", `${definition.name}.plist`)
      : homePath("Library", "Application Support", "define-service", `${definition.name}.plist`);
  }

  private alternatePath(definition: ResolvedServiceOptions): string {
    if (definition.scope === "system") {
      return homePath("Library", "Application Support", "define-service", `${definition.name}.plist`);
    }

    return definition.boot
      ? homePath("Library", "Application Support", "define-service", `${definition.name}.plist`)
      : homePath("Library", "LaunchAgents", `${definition.name}.plist`);
  }
}

export function renderLaunchdPlist(definition: ResolvedServiceOptions): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${xmlEscape(definition.name)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...[definition.command, ...definition.args].map(
      (argument) => `    <string>${xmlEscape(argument)}</string>`,
    ),
    "  </array>",
    definition.description
      ? ["  <key>ProcessType</key>", "  <string>Background</string>"].join("\n")
      : undefined,
    definition.cwd
      ? ["  <key>WorkingDirectory</key>", `  <string>${xmlEscape(definition.cwd)}</string>`].join("\n")
      : undefined,
    Object.keys(definition.env).length > 0
      ? [
          "  <key>EnvironmentVariables</key>",
          "  <dict>",
          ...Object.entries(definition.env)
            .sort(([left], [right]) => left.localeCompare(right))
            .flatMap(([key, value]) => [
              `    <key>${xmlEscape(key)}</key>`,
              `    <string>${xmlEscape(value)}</string>`,
            ]),
          "  </dict>",
        ].join("\n")
      : undefined,
    definition.boot ? ["  <key>RunAtLoad</key>", "  <true/>"].join("\n") : undefined,
    renderLaunchdKeepAlive(definition.restart),
    "</dict>",
    "</plist>",
    "",
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function renderLaunchdKeepAlive(restart: ResolvedServiceOptions["restart"]): string | undefined {
  switch (restart) {
    case "always":
      return ["  <key>KeepAlive</key>", "  <true/>"].join("\n");
    case "on-failure":
      return [
        "  <key>KeepAlive</key>",
        "  <dict>",
        "    <key>SuccessfulExit</key>",
        "    <false/>",
        "  </dict>",
      ].join("\n");
    case "never":
      return undefined;
  }
}
