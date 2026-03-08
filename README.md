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
