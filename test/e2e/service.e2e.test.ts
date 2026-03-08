import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { defineService } from "../../src";
import { makeTempDir, readText, waitFor } from "../helpers";

const fixturePath = resolve("test/fixtures/service-runner.mjs");

describe("service pipeline", () => {
  const scope =
    process.platform === "linux" && process.getuid?.() === 0 ? "system" : "user";
  const name = `define-service-${process.platform}-${Date.now()}`;
  let stateDir = "";
  let heartbeatPath = "";
  let app = defineService({
    name,
    run: [process.execPath, fixturePath, "__pending__"],
    boot: false,
    restart: "on-failure",
    scope,
  });

  beforeAll(async () => {
    stateDir = await makeTempDir("define-service-e2e-");
    heartbeatPath = join(stateDir, "heartbeat.txt");
    app = defineService({
      name,
      run: [process.execPath, fixturePath, stateDir],
      boot: false,
      restart: "on-failure",
      scope,
    });
    await app.unregister().catch(() => {});
  });

  afterAll(async () => {
    await app.unregister().catch(() => {});
    await rm(stateDir, { recursive: true, force: true });
  });

  test(
    "registers, starts, stops, restarts, reports status, and unregisters",
    async () => {
      await app.register();
      expect(await app.status()).toBe("registered");

      await app.start();
      await waitFor("the service to start", async () => (await app.status()) === "running");
      await waitFor("the heartbeat file", async () => (await readText(heartbeatPath)) !== undefined);

      const firstHeartbeat = await readText(heartbeatPath);
      expect(firstHeartbeat).toBeDefined();

      await app.stop();
      await waitFor("the service to stop", async () => (await app.status()) === "registered");

      await app.restart();
      await waitFor("the service to restart", async () => (await app.status()) === "running");
      await waitFor(
        "a new heartbeat after restart",
        async () => {
          const nextHeartbeat = await readText(heartbeatPath);
          return Boolean(nextHeartbeat && nextHeartbeat !== firstHeartbeat);
        },
        30_000,
      );

      expect(await app.status()).toBe("running");

      await app.unregister();
      await waitFor("the service to be removed", async () => (await app.status()) === "missing");
    },
    120_000,
  );
});
