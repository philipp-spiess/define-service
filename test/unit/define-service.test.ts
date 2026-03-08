import { describe, expect, test } from "bun:test";

import { normalizeServiceOptions } from "../../src/internal";
import { defineService } from "../../src/service";

describe("defineService", () => {
  test("applies sensible defaults", () => {
    const service = defineService({
      name: "acme-agent",
      run: ["/usr/bin/env", "node"],
    });

    expect(service.name).toBe("acme-agent");
    expect(service.options.boot).toBe(true);
    expect(service.options.restart).toBe("on-failure");
    expect(service.options.scope).toBe("user");
  });

  test("rejects invalid names", () => {
    expect(() =>
      normalizeServiceOptions({
        name: "bad name",
        run: ["/usr/bin/env"],
      }),
    ).toThrow("Invalid service name");
  });
});
