import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function self(...args: string[]): [string, ...string[]] {
  if (typeof Bun !== "undefined") {
    const main = Bun.main;

    if (isCompiledBunMain(main)) {
      return [process.execPath, ...args];
    }

    return [process.execPath, main, ...args];
  }

  let isSea = false;

  try {
    const sea = require("node:sea") as { isSea?: () => boolean };
    isSea = sea.isSea?.() ?? false;
  } catch {
    isSea = false;
  }

  if (isSea) {
    return [process.execPath, ...args];
  }

  const entrypoint = process.argv[1];

  if (!entrypoint) {
    return [process.execPath, ...args];
  }

  return [process.execPath, entrypoint, ...args];
}

function isCompiledBunMain(main: string): boolean {
  const normalizedMain = normalizePathForComparison(main);
  const normalizedExecPath = normalizePathForComparison(process.execPath);

  return normalizedMain.includes("/$bunfs/") || normalizedMain === normalizedExecPath;
}

function normalizePathForComparison(path: string): string {
  const normalized = path.replaceAll("\\", "/");

  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
