import { mkdir, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
await rm(new URL("../src/index.js", import.meta.url), { force: true });
await rm(new URL("../src/index.js.map", import.meta.url), { force: true });
await rm(new URL("../src/index.cjs", import.meta.url), { force: true });
await rm(new URL("../src/index.cjs.map", import.meta.url), { force: true });

for (const [format, outdir, outfile] of [
  ["esm", "./dist/esm", "./dist/index.js"],
  ["cjs", "./dist/cjs", "./dist/index.cjs"],
] as const) {
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir,
    target: "node",
    format,
    sourcemap: "linked",
    packages: "bundle",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
  await rename(new URL(`../${outdir}/index.js`, import.meta.url), new URL(`../${outfile}`, import.meta.url));
  await rename(
    new URL(`../${outdir}/index.js.map`, import.meta.url),
    new URL(`../${outfile}.map`, import.meta.url),
  );
}

await rm(new URL("../dist/esm", import.meta.url), { recursive: true, force: true });
await rm(new URL("../dist/cjs", import.meta.url), { recursive: true, force: true });

const types = Bun.spawnSync(
  [
    process.execPath,
    "x",
    "tsc",
    "--project",
    "./tsconfig.build.json",
  ],
  {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (types.exitCode !== 0) {
  process.exit(types.exitCode);
}
