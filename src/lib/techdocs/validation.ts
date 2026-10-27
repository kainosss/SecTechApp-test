/**
 * Network value checks. These only produce warnings: entries can always be
 * saved incomplete, nothing is rewritten, and valid syntax doesn't mean the
 * configuration is correct for the site.
 */
import type { Equipment, TechRegister } from "./schema";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIPv4(s: string): boolean {
  return IPV4.test(s);
}

/** IPv6 (incl. "::" compression and an embedded IPv4 tail); a zone index ("%eth0") is allowed. */
export function isIPv6(s: string): boolean {
  const addr = s.split("%")[0]!;
  if (!/^[0-9a-fA-F:.]+$/.test(addr) || !addr.includes(":")) return false;
  const parts = addr.split("::");
  if (parts.length > 2) return false;
  const groups = (p: string) => (p ? p.split(":") : []);
  let head = groups(parts[0]!);
  let tail = parts.length === 2 ? groups(parts[1]!) : [];
  let extra = 0;
  // An IPv4 tail counts as two groups.
  const last = (tail.length ? tail : head).at(-1);
  if (last && last.includes(".")) {
    if (!isIPv4(last)) return false;
    if (tail.length) tail = tail.slice(0, -1);
    else head = head.slice(0, -1);
    extra = 2;
  }
  const all = [...head, ...tail];
  if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  const count = all.length + extra;
  return parts.length === 2 ? count < 8 : count === 8;
}

const ipv4ToInt = (s: string) => s.split(".").reduce((n, o) => n * 256 + Number(o), 0);

/** Prefix length from "255.255.255.0", "/24" or "24" (IPv4), or null when not a valid mask/prefix. */
export function ipv4Prefix(subnet: string): number | null {
  const s = subnet.trim();
  const p = s.match(/^\/?(\d{1,2})$/);
  if (p) return Number(p[1]) <= 32 ? Number(p[1]) : null;
  if (!isIPv4(s)) return null;
  const n = ipv4ToInt(s);
  // A mask is contiguous ones followed by zeros.
  const inverted = ~n >>> 0;
  if ((inverted & (inverted + 1)) !== 0) return null;
  return 32 - Math.log2(inverted + 1);
}

const MAC = /^([0-9a-fA-F]{2})([:-])[0-9a-fA-F]{2}(\2[0-9a-fA-F]{2}){4}$|^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$|^[0-9a-fA-F]{12}$/;

export interface FieldWarning {
  field: keyof Equipment;
  message: string;
}

/** Warnings for one entry; `register` enables the duplicate-IP check. */
export function equipmentWarnings(item: Equipment, register?: TechRegister): FieldWarning[] {
  const out: FieldWarning[] = [];
  const ip = item.ip.trim();
  const v4 = isIPv4(ip);
  if (ip && !v4 && !isIPv6(ip)) out.push({ field: "ip", message: "Doesn't look like a valid IPv4 or IPv6 address." });
  const subnet = item.subnet.trim();
  const prefix = subnet ? ipv4Prefix(subnet) : null;
  if (subnet && prefix === null) {
    const v6Prefix = /^\/?\d{1,3}$/.test(subnet) && Number(subnet.replace("/", "")) <= 128;
    if (!(isIPv6(ip) && v6Prefix)) out.push({ field: "subnet", message: "Enter a subnet mask (e.g. 255.255.255.0) or prefix (e.g. /24)." });
  }
  for (const field of ["gateway", "dns1", "dns2"] as const) {
    const v = item[field].trim();
    if (v && !isIPv4(v) && !isIPv6(v)) out.push({ field, message: "Doesn't look like a valid IP address." });
  }
  const gw = item.gateway.trim();
  if (v4 && prefix !== null && prefix > 0 && isIPv4(gw)) {
    const mask = prefix === 32 ? 0xffffffff : (~0 << (32 - prefix)) >>> 0;
    if (((ipv4ToInt(ip) & mask) >>> 0) !== ((ipv4ToInt(gw) & mask) >>> 0)) out.push({ field: "gateway", message: "Gateway isn't in the same subnet as the IP address — check the values." });
  }
  const vlan = item.vlan.trim();
  if (vlan && !(/^\d{1,4}$/.test(vlan) && Number(vlan) >= 1 && Number(vlan) <= 4094)) out.push({ field: "vlan", message: "VLAN IDs are whole numbers from 1 to 4094." });
  const mac = item.mac.trim();
  if (mac && !MAC.test(mac)) out.push({ field: "mac", message: "Doesn't look like a MAC address (e.g. AA:BB:CC:DD:EE:FF)." });
  if (ip && register) {
    const others = register.equipment.filter((e) => e.id !== item.id && e.ip.trim().toLowerCase() === ip.toLowerCase());
    if (others.length) out.push({ field: "ip", message: `Same IP address as ${others.length} other entr${others.length === 1 ? "y" : "ies"} in this register.` });
  }
  return out;
}

/** IP addresses entered more than once in the register (case-insensitive), with how many entries use each. */
export function duplicateIps(register: TechRegister): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of register.equipment) {
    const ip = e.ip.trim().toLowerCase();
    if (ip) counts.set(ip, (counts.get(ip) ?? 0) + 1);
  }
  return new Map([...counts].filter(([, n]) => n > 1));
}

/** Number of entries with at least one warning (for the register overview). */
export function entriesWithWarnings(register: TechRegister): number {
  return register.equipment.filter((e) => equipmentWarnings(e, register).length > 0).length;
}
