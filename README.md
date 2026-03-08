# define-service

Tiny object-style native service management for Bun, Node.js, and standalone executables.

```ts
import { defineService, self } from "define-service";

const app = defineService({
  name: "acme-agent",
  run: self("serve"),
  boot: true,
  restart: "on-failure",
});

await app.register();
await app.start();
```

## Install

```bash
bun add define-service
```

## Quick Start

Use `self()` when the service should relaunch the current app:

```ts
import { defineService, self } from "define-service";

const app = defineService({
  name: "acme-agent",
  description: "Background sync agent",
  run: self("serve"),
  boot: true,
  restart: "on-failure",
});

await app.register();
await app.start();

console.log(await app.status()); // "running"
```

Use an explicit command when you already know the binary you want to run:

```ts
import { defineService } from "define-service";

const app = defineService({
  name: "myapp",
  run: ["/opt/myapp/myapp", "serve"],
  boot: true,
  restart: "always",
});

await app.register();
```

Once you have a service handle, everything stays on that object:

```ts
await app.stop();
await app.start();
await app.restart();
await app.unregister();
```

## What `self()` Does

`self()` figures out how to relaunch the current app:

- Bun source mode: `bun your-entry.ts ...args`
- Bun compiled executable: `./your-binary ...args`
- Node source mode: `node your-entry.js ...args`
- Node SEA executable: `./your-binary ...args`

## Platforms

- Linux: `systemd`
- macOS: `launchd`
- Windows: Task Scheduler

## Notes

- `register()` installs the service definition. `start()` makes sure it is running now.
- On Linux, user-level services only start before login if lingering is enabled for that user.
- On Windows, v1 uses Task Scheduler instead of the Service Control Manager so it can manage ordinary executables without a custom Windows service host.
