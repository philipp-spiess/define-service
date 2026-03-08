import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";

export type RestartMode = "always" | "on-failure" | "never";
export type ServiceScope = "user" | "system";
export type ServiceStatus = "missing" | "registered" | "running";
export type RunDefinition = string | readonly [string, ...string[]] | readonly string[];

export interface ServiceOptions {
  name: string;
  run: RunDefinition;
  description?: string;
  cwd?: string;
  env?: Record<string, string>;
  boot?: boolean;
  restart?: RestartMode;
  scope?: ServiceScope;
}

export interface ResolvedServiceOptions {
  name: string;
  description?: string;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  boot: boolean;
  restart: RestartMode;
  scope: ServiceScope;
}

export interface ServiceBackend {
  register(definition: ResolvedServiceOptions): Promise<void>;
  unregister(definition: ResolvedServiceOptions): Promise<void>;
  start(definition: ResolvedServiceOptions): Promise<void>;
  stop(definition: ResolvedServiceOptions): Promise<void>;
  restart(definition: ResolvedServiceOptions): Promise<void>;
  status(definition: ResolvedServiceOptions): Promise<ServiceStatus>;
}

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function normalizeServiceOptions(options: ServiceOptions): ResolvedServiceOptions {
  const name = options.name.trim();

  if (!name) {
    throw new Error("Service name is required.");
  }

  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(
      `Invalid service name "${options.name}". Use only letters, numbers, dots, dashes, and underscores.`,
    );
  }

  const { command, args } = normalizeRunDefinition(options.run);

  const normalized: ResolvedServiceOptions = {
    name,
    command: resolveExecutable(command),
    args,
    env: { ...(options.env ?? {}) },
    boot: options.boot ?? true,
    restart: options.restart ?? "on-failure",
    scope: options.scope ?? "user",
  };

  if (options.description?.trim()) {
    normalized.description = options.description.trim();
  }

  if (options.cwd) {
    normalized.cwd = resolve(options.cwd);
  }

  return normalized;
}

export function normalizeRunDefinition(run: RunDefinition): {
  command: string;
  args: string[];
} {
  if (typeof run === "string") {
    const command = run.trim();

    if (!command) {
      throw new Error("The run command cannot be empty.");
    }

    return { command, args: [] };
  }

  const [command, ...args] = run;

  if (!command || !command.trim()) {
    throw new Error("The run command cannot be empty.");
  }

  return {
    command: command.trim(),
    args: args.map((arg) => `${arg}`),
  };
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code) => {
      const result = {
        exitCode: code ?? 0,
        stdout,
        stderr,
      };

      if (!options.allowFailure && result.exitCode !== 0) {
        reject(
          new Error(
            [
              `Command failed: ${[command, ...args].join(" ")}`,
              stderr.trim(),
              stdout.trim(),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      resolveResult(result);
    });
  });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export function resolveExecutable(command: string): string {
  if (looksLikePath(command)) {
    return resolve(command);
  }

  const resolved = findExecutableInPath(command);
  return resolved ?? command;
}

function looksLikePath(command: string): boolean {
  return isAbsolute(command) || command.startsWith("./") || command.startsWith("../");
}

function findExecutableInPath(command: string): string | undefined {
  const pathValue = process.env.PATH;

  if (!pathValue) {
    return undefined;
  }

  const searchPaths = pathValue.split(delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [".EXE", ".CMD", ".BAT"])
      : [""];

  for (const searchPath of searchPaths) {
    for (const extension of extensions) {
      const candidate = join(searchPath, `${command}${extension}`);

      try {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

export function homePath(...parts: string[]): string {
  return join(homedir(), ...parts);
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function quoteSystemdWord(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

export function quoteWindowsCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
