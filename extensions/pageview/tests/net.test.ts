import { describe, expect, it } from "vitest";
import { pickTailscaleAddress } from "../src/net.ts";

type Iface = { family: string; address: string; internal: boolean };

function v4(address: string, internal = false): Iface {
  return { family: "IPv4", address, internal };
}

describe("pickTailscaleAddress", () => {
  it("picks the IPv4 address of an interface named tailscale*", () => {
    const picked = pickTailscaleAddress({
      lo: [v4("127.0.0.1", true)],
      eth0: [v4("192.168.1.2")],
      tailscale0: [
        { family: "IPv6", address: "fd7a::1", internal: false },
        v4("100.100.100.100"),
      ],
    });
    expect(picked).toBe("100.100.100.100");
  });

  it("refuses a CGNAT-range address on a non-tailscale interface", () => {
    // Could be carrier NAT on a WAN interface; binding it would leave the
    // tailnet boundary, so only tailscale-named interfaces qualify.
    const picked = pickTailscaleAddress({
      lo: [v4("127.0.0.1", true)],
      wg0: [v4("100.100.1.5")],
    });
    expect(picked).toBeUndefined();
  });

  it("refuses a tailscale-named interface without a CGNAT address", () => {
    const picked = pickTailscaleAddress({
      lo: [v4("127.0.0.1", true)],
      tailscale0: [v4("100.20.1.5")], // 100.20 is public space, below 100.64
    });
    expect(picked).toBeUndefined();
  });

  it("returns undefined when only loopback and LAN exist", () => {
    const picked = pickTailscaleAddress({
      lo: [v4("127.0.0.1", true)],
      eth0: [v4("192.168.1.2")],
    });
    expect(picked).toBeUndefined();
  });
});
