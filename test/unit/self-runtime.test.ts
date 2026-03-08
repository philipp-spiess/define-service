import { afterAll, describe, expect, test } from "bun:test";
import { accessSync, constants as fsConstants } from "node:fs";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";

const fixturePath = resolve("test/fixtures/self-entry.mjs");
const tempDir = await mkdtemp(join(tmpdir(), "define-service-self-"));
const nodeBinary = pickNodeBinary();
const seaNodeBinary = pickNodeBinary("--build-sea");

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("self()", () => {
  test("works in Bun source mode", async () => {
    const result = Bun.spawnSync(["bun", fixturePath], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);

    const value = JSON.parse(result.stdout.toString()) as string[];
    expect(value.length).toBe(3);
    expect(basename(value[0]!)).toContain("bun");
    expect(value[1]).toBe(fixturePath);
    expect(value[2]).toBe("serve");
  });

  test("works in Node source mode", async () => {
    const bundle = await Bun.build({
      entrypoints: [fixturePath],
      outdir: tempDir,
      target: "node",
      format: "cjs",
      packages: "bundle",
    });

    expect(bundle.success).toBe(true);
    const bundledPath = bundle.outputs[0]!.path;

    const result = Bun.spawnSync([nodeBinary, bundledPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);

    const value = JSON.parse(result.stdout.toString()) as string[];
    expect(value.length).toBe(3);
    expect(basename(value[0]!)).toContain("node");
    expect(value[1]).toBe(bundledPath);
    expect(value[2]).toBe("serve");
  });

  test("works in a compiled Bun executable", async () => {
    const output = join(tempDir, process.platform === "win32" ? "self-bun.exe" : "self-bun");
    const build = await Bun.build({
      entrypoints: [fixturePath],
      compile: {
        outfile: output,
      },
      target: "bun",
    });

    expect(build.success).toBe(true);

    const result = Bun.spawnSync([output], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);

    const value = JSON.parse(result.stdout.toString()) as string[];
    expect(value.length).toBe(2);
    expect(await realpath(value[0]!)).toBe(await realpath(output));
    expect(value[1]).toBe("serve");
  });

  test("works in a Node SEA binary", async () => {
    if (!seaNodeBinary) {
      return;
    }

    const bundle = await Bun.build({
      entrypoints: [fixturePath],
      outdir: tempDir,
      target: "node",
      format: "cjs",
      packages: "bundle",
    });

    expect(bundle.success).toBe(true);
    const bundledPath = bundle.outputs[0]!.path;

    const executable =
      process.platform === "win32" ? join(tempDir, "self-node.exe") : join(tempDir, "self-node");
    const configPath = join(tempDir, "sea-config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          main: bundledPath,
          mainFormat: "commonjs",
          executable: seaNodeBinary,
          output: executable,
          disableExperimentalSEAWarning: true,
          useSnapshot: false,
          useCodeCache: false,
        },
        null,
        2,
      ),
      "utf8",
    );

    const build = Bun.spawnSync([seaNodeBinary, "--build-sea", configPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(build.exitCode).toBe(0);

    if (process.platform === "darwin") {
      const sign = Bun.spawnSync(["codesign", "--sign", "-", executable], {
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(sign.exitCode).toBe(0);
    } else {
      await chmod(executable, 0o755);
    }

    const result = Bun.spawnSync([executable], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);

    const value = JSON.parse(result.stdout.toString()) as string[];
    expect(value.length).toBe(2);
    expect(await realpath(value[0]!)).toBe(await realpath(executable));
    expect(value[1]).toBe("serve");
  }, 60_000);
});

function pickNodeBinary(requiredFlag?: string): string {
  const candidates = [
    ...(process.env.PATH?.split(delimiter).map((pathPart) =>
      join(pathPart, process.platform === "win32" ? "node.exe" : "node"),
    ) ?? []),
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK);
    } catch {
      continue;
    }

    if (!requiredFlag) {
      return candidate;
    }

    const help = Bun.spawnSync([candidate, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (help.exitCode === 0 && help.stdout.toString().includes(requiredFlag)) {
      return candidate;
    }
  }

  if (requiredFlag) {
    return "";
  }

  throw new Error("Could not find a usable Node.js binary in PATH.");
}
