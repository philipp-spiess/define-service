import { describe, expect, test } from "bun:test";

import { normalizeServiceOptions } from "../../src/internal";
import { renderSystemdUnit } from "../../src/linux";
import { renderLaunchdPlist } from "../../src/macos";
import { renderWindowsWrapper } from "../../src/windows";

const definition = normalizeServiceOptions({
  name: "acme-agent",
  description: "Background sync agent",
  run: ["/opt/acme/agent", "serve", "--foreground"],
  cwd: "/opt/acme",
  env: {
    ACME_TOKEN: "secret",
  },
  boot: true,
  restart: "on-failure",
});

describe("platform renderers", () => {
  test("renders a systemd unit", () => {
    const unit = renderSystemdUnit(definition);

    expect(unit).toContain("Description=Background sync agent");
    expect(unit).toContain('ExecStart="/opt/acme/agent" "serve" "--foreground"');
    expect(unit).toContain('Environment="ACME_TOKEN=secret"');
    expect(unit).toContain("Restart=on-failure");
  });

  test("renders a launchd plist", () => {
    const plist = renderLaunchdPlist(definition);

    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("<string>acme-agent</string>");
    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
  });

  test("renders a PowerShell wrapper", () => {
    const wrapper = renderWindowsWrapper(definition);

    expect(wrapper).toContain("$env:ACME_TOKEN = 'secret'");
    expect(wrapper).toContain("Set-Location -LiteralPath '/opt/acme'");
    expect(wrapper).toContain("& '/opt/acme/agent' @('serve', '--foreground')");
  });
});
