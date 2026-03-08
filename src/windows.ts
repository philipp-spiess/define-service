import { join } from "node:path";

import {
  type ResolvedServiceOptions,
  type ServiceBackend,
  fileExists,
  homePath,
  quotePowerShell,
  readTextFile,
  removeFile,
  runCommand,
  writeTextFile,
} from "./internal";

export class WindowsBackend implements ServiceBackend {
  async register(definition: ResolvedServiceOptions): Promise<void> {
    const wrapperPath = this.wrapperPath(definition);
    await writeTextFile(wrapperPath, renderWindowsWrapper(definition));

    const result = await this.runPowerShell(
      [
        "$ErrorActionPreference = 'Stop'",
        `$taskName = ${quotePowerShell(definition.name)}`,
        `$wrapper = ${quotePowerShell(wrapperPath)}`,
        `$description = ${quotePowerShell(definition.description ?? definition.name)}`,
        `$restart = ${quotePowerShell(definition.restart)}`,
        `$boot = ${definition.boot ? "$true" : "$false"}`,
        `$scope = ${quotePowerShell(definition.scope)}`,
        "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"' + $wrapper + '\"')",
        "$settingsArgs = @{ AllowStartIfOnBatteries = $true; DontStopIfGoingOnBatteries = $true }",
        "if ($restart -ne 'never') {",
        "  $settingsArgs.RestartCount = 999",
        "  $settingsArgs.RestartInterval = (New-TimeSpan -Minutes 1)",
        "}",
        "$settings = New-ScheduledTaskSettingsSet @settingsArgs",
        "$taskArgs = @{ TaskName = $taskName; Action = $action; Description = $description; Settings = $settings; Force = $true }",
        "if ($boot) {",
        "  if ($scope -eq 'system') {",
        "    $taskArgs.Trigger = New-ScheduledTaskTrigger -AtStartup",
        "  } else {",
        "    $taskArgs.Trigger = New-ScheduledTaskTrigger -AtLogOn",
        "  }",
        "}",
        "Register-ScheduledTask @taskArgs | Out-Null",
      ].join("\n"),
    );

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async unregister(definition: ResolvedServiceOptions): Promise<void> {
    await this.stop(definition);
    await this.runPowerShell(
      [
        "$ErrorActionPreference = 'SilentlyContinue'",
        `Unregister-ScheduledTask -TaskName ${quotePowerShell(definition.name)} -Confirm:$false`,
      ].join("\n"),
    );
    await removeFile(this.wrapperPath(definition));
  }

  async start(definition: ResolvedServiceOptions): Promise<void> {
    const result = await this.runPowerShell(
      [
        "$ErrorActionPreference = 'Stop'",
        `Start-ScheduledTask -TaskName ${quotePowerShell(definition.name)}`,
      ].join("\n"),
    );

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async stop(definition: ResolvedServiceOptions): Promise<void> {
    await this.runPowerShell(
      [
        "$ErrorActionPreference = 'SilentlyContinue'",
        `Stop-ScheduledTask -TaskName ${quotePowerShell(definition.name)}`,
      ].join("\n"),
    );
  }

  async restart(definition: ResolvedServiceOptions): Promise<void> {
    if ((await this.status(definition)) === "missing") {
      throw new Error(`Service "${definition.name}" is not registered.`);
    }

    await this.stop(definition);
    await this.start(definition);
  }

  async status(definition: ResolvedServiceOptions): Promise<"missing" | "registered" | "running"> {
    if (!(await fileExists(this.wrapperPath(definition)))) {
      return "missing";
    }

    const result = await this.runPowerShell(
      [
        "$ErrorActionPreference = 'SilentlyContinue'",
        `$task = Get-ScheduledTask -TaskName ${quotePowerShell(definition.name)}`,
        "if (-not $task) {",
        "  Write-Output 'missing'",
        "  exit 0",
        "}",
        "Write-Output $task.State.ToString()",
      ].join("\n"),
    );

    const state = result.stdout.trim().toLowerCase();

    if (state === "missing") {
      return "missing";
    }

    return state === "running" ? "running" : "registered";
  }

  private wrapperPath(definition: ResolvedServiceOptions): string {
    const base =
      process.env.LOCALAPPDATA ??
      homePath("AppData", "Local");

    return join(base, "define-service", `${definition.name}.ps1`);
  }

  private async runPowerShell(script: string) {
    return await runCommand(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { allowFailure: true },
    );
  }
}

export function renderWindowsWrapper(definition: ResolvedServiceOptions): string {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    ...Object.entries(definition.env)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `$env:${key} = ${quotePowerShell(value)}`),
    definition.cwd ? `Set-Location -LiteralPath ${quotePowerShell(definition.cwd)}` : undefined,
    `& ${quotePowerShell(definition.command)} @(${definition.args
      .map((argument) => quotePowerShell(argument))
      .join(", ")})`,
    "exit $LASTEXITCODE",
    "",
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}
