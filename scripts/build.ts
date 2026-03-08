const root = new URL("..", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);

await Bun.$`rm -rf ${distDir.pathname}`;

for (const format of ["esm", "cjs"] as const) {
  const outfile = new URL(
    format === "esm" ? "../dist/index.js" : "../dist/index.cjs",
    import.meta.url,
  );

  const result = await Bun.build({
    entrypoints: [new URL("../src/index.ts", import.meta.url).pathname],
    outdir: distDir.pathname,
    outfile: outfile.pathname,
    target: "node",
    format,
    minify: false,
    sourcemap: "linked",
    packages: "bundle",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

const types = Bun.spawnSync(
  [
    Bun.which("bunx") ?? "bunx",
    "tsc",
    "--project",
    new URL("../tsconfig.json", import.meta.url).pathname,
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    new URL("../dist", import.meta.url).pathname,
  ],
  {
    cwd: root.pathname,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (types.exitCode !== 0) {
  process.exit(types.exitCode);
}
