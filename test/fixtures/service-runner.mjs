import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const stateDir = process.argv[2];

if (!stateDir) {
  throw new Error("Expected a state directory argument.");
}

mkdirSync(stateDir, { recursive: true });

const heartbeatFile = join(stateDir, "heartbeat.txt");
const eventsFile = join(stateDir, "events.log");
const pidFile = join(stateDir, "pid.txt");

writeFileSync(pidFile, `${process.pid}\n`);
appendFileSync(eventsFile, `start:${Date.now()}:${process.pid}\n`);
writeFileSync(heartbeatFile, `${Date.now()}\n`);

const interval = setInterval(() => {
  writeFileSync(heartbeatFile, `${Date.now()}\n`);
}, 250);

function stop(signal) {
  clearInterval(interval);
  appendFileSync(eventsFile, `stop:${signal}:${Date.now()}:${process.pid}\n`);
  process.exit(0);
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

setInterval(() => {}, 1 << 30);
