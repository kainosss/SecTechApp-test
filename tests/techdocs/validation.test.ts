import { describe, expect, it } from "vitest";
import { blankEquipment } from "@/lib/techdocs/register";
import { duplicateIps, entriesWithWarnings, equipmentWarnings, ipv4Prefix, isIPv4, isIPv6 } from "@/lib/techdocs/validation";
import { cctvInstall, mixedSite } from "./fixtures";

const warn = (patch: Parameters<typeof Object.assign>[1]) => equipmentWarnings({ ...blankEquipment("ip-camera"), ...patch }).map((w) => w.field);

describe("address syntax", () => {
  it("IPv4", () => {
    for (const ok of ["0.0.0.0", "10.20.0.101", "192.168.1.1", "255.255.255.255"]) expect(isIPv4(ok), ok).toBe(true);
    for (const bad of ["192.168.1", "192.168.1.256", "192.168.01.1", "1.2.3.4.5", "a.b.c.d", " 10.0.0.1", ""]) expect(isIPv4(bad), bad).toBe(false);
  });
  it("IPv6", () => {
    for (const ok of ["::1", "::", "fe80::1ff:fe23:4567:890a", "2001:db8:0:0:0:0:2:1", "2001:db8::2:1", "::ffff:192.168.1.1", "fe80::1%eth0"]) expect(isIPv6(ok), ok).toBe(true);
    for (const bad of ["2001:db8::2::1", "12345::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "192.168.1.1", "g::1", ":::"]) expect(isIPv6(bad), bad).toBe(false);
  });
  it("subnet masks and CIDR prefixes", () => {
    expect(ipv4Prefix("255.255.255.0")).toBe(24);
    expect(ipv4Prefix("255.255.0.0")).toBe(16);
    expect(ipv4Prefix("255.255.255.252")).toBe(30);
    expect(ipv4Prefix("0.0.0.0")).toBe(0);
    expect(ipv4Prefix("/24")).toBe(24);
    expect(ipv4Prefix("24")).toBe(24);
    expect(ipv4Prefix("255.0.255.0")).toBeNull(); // not contiguous
    expect(ipv4Prefix("/33")).toBeNull();
    expect(ipv4Prefix("255.255.255.1")).toBeNull();
  });
});

describe("warnings", () => {
  it("accepts well-formed configurations without warnings", () => {
    expect(warn({ ip: "10.20.0.101", subnet: "255.255.255.0", gateway: "10.20.0.1", dns1: "10.20.0.1", dns2: "1.1.1.1", vlan: "20", mac: "00:11:22:33:44:55" })).toEqual([]);
    expect(warn({ ip: "fe80::1", subnet: "/64", mac: "0011.2233.4455" })).toEqual([]);
    expect(warn({ mac: "00-11-22-33-44-55" })).toEqual([]);
    expect(warn({ mac: "001122334455" })).toEqual([]);
    expect(warn({})).toEqual([]); // incomplete entries are fine
  });

  it("warns about malformed values without changing them", () => {
    const e = { ...blankEquipment(), ip: "192.168.10.300", subnet: "255.0.255.0", gateway: "gw", vlan: "5000", mac: "not-a-mac" };
    const before = structuredClone(e);
    expect(equipmentWarnings(e).map((w) => w.field)).toEqual(["ip", "subnet", "gateway", "vlan", "mac"]);
    expect(e).toEqual(before);
    expect(warn({ vlan: "0" })).toEqual(["vlan"]);
    expect(warn({ vlan: "4094" })).toEqual([]);
    expect(warn({ vlan: "20a" })).toEqual(["vlan"]);
    expect(warn({ mac: "00:11:22-33:44:55" })).toEqual(["mac"]);
  });

  it("flags a gateway outside the subnet (syntax alone isn't correctness)", () => {
    expect(warn({ ip: "10.20.0.101", subnet: "/24", gateway: "10.21.0.1" })).toEqual(["gateway"]);
    expect(warn({ ip: "10.20.0.101", subnet: "/16", gateway: "10.20.9.1" })).toEqual([]);
  });

  it("warns about duplicate IP addresses within a register", () => {
    const m = mixedSite();
    expect([...duplicateIps(m)]).toEqual([["192.168.10.21", 2]]);
    const gate = m.equipment.find((e) => e.name === "CAM-Gate")!;
    expect(equipmentWarnings(gate, m).find((w) => w.field === "ip")?.message).toMatch(/Same IP address as 1 other entry/);
    expect(equipmentWarnings(gate).some((w) => w.field === "ip")).toBe(false);
    expect(entriesWithWarnings(m)).toBe(3);
    expect(entriesWithWarnings(cctvInstall())).toBe(0);
  });
});
