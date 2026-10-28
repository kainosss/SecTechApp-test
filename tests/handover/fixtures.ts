/** Sample handovers for tests and visual QA. The branded sample uses a fictional company and a generated logo. */
import { deflateSync } from "node:zlib";
import { EMPTY_BRANDING, type Branding } from "@/lib/handover/branding";
import type { HandoverOptions } from "@/lib/handover/content";
import type { Report } from "@/lib/reports/schema";
import { accessFaults, cctvFaults, emptyReport, intruderInspection, largeRegister, longText, shortCctv } from "../reports/fixtures";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A 300×100 RGBA PNG: navy shield-like block and blue bar on a transparent background. */
export function sampleLogoPng(width = 300, height = 100): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 4 + 1) + 1 + x * 4;
      const inShield = x >= 8 && x < 92 && y >= 8 && y < 92 && Math.abs(x - 50) <= 42 - Math.max(0, y - 60);
      const inBar = x >= 108 && x < 292 && ((y >= 30 && y < 46) || (y >= 56 && y < 66 && x < 230));
      const [r, g, b, a] = inShield ? [23, 50, 77, 255] : inBar ? [40, 90, 122, 255] : [0, 0, 0, 0];
      raw[o] = r!;
      raw[o + 1] = g!;
      raw[o + 2] = b!;
      raw[o + 3] = a!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export const sampleBranding = (): Branding => ({
  companyName: "Example Security Services",
  phone: "02 9000 0000",
  email: "service@example.com.au",
  address: "Unit 3, 10 Example Street\nSydney NSW 2000",
  abn: "00 000 000 000",
  accent: "#285A7A",
  logo: { dataUrl: `data:image/png;base64,${sampleLogoPng().toString("base64")}`, format: "PNG", width: 300, height: 100 },
});

interface Sample {
  report: () => Report;
  branding: () => Branding;
  options?: Partial<HandoverOptions>;
}
const plain = () => EMPTY_BRANDING;

export const HANDOVER_SAMPLES: Record<string, Sample> = {
  shortCctv: { report: shortCctv, branding: plain },
  cctvFaults: { report: cctvFaults, branding: plain },
  intruder: { report: intruderInspection, branding: plain },
  access: { report: accessFaults, branding: plain },
  longText: { report: longText, branding: plain },
  largeSchedule: { report: largeRegister, branding: plain },
  minimal: { report: emptyReport, branding: plain },
  branded: { report: cctvFaults, branding: sampleBranding },
  unbranded: { report: intruderInspection, branding: plain, options: { schedule: false } },
};
