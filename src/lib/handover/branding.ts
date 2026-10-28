/**
 * Optional company branding for client handover PDFs, stored on this device
 * only. Every field is optional and nothing is pre-filled: with no branding
 * the document is a clean, unbranded report. Logos are checked by their
 * actual file signature (not just the declared type), size-limited, and
 * kept as a data URL — never uploaded.
 */
import { scopedKey } from "@/lib/workspace";
import { z } from "zod";

export const BRANDING_KEY = "fieldwise:branding:v1";
/** Logo files larger than this are refused (they are stored in browser storage as base64). */
export const MAX_LOGO_BYTES = 512 * 1024;
export const MAX_LOGO_PIXELS = 4000;

const text = (max: number) => z.string().max(max).default("");

export const logoSchema = z.object({
  dataUrl: z
    .string()
    .max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 64)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/),
  format: z.enum(["PNG", "JPEG"]),
  width: z.number().int().min(1).max(MAX_LOGO_PIXELS),
  height: z.number().int().min(1).max(MAX_LOGO_PIXELS),
});
export type Logo = z.infer<typeof logoSchema>;

export const brandingSchema = z.object({
  companyName: text(120),
  phone: text(40),
  email: text(120),
  address: text(300),
  abn: text(30),
  /** Used only for rules and accents — never for text, so a light colour can't make text unreadable. */
  accent: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).default(""),
  logo: logoSchema.nullable().default(null),
});
export type Branding = z.infer<typeof brandingSchema>;

export const EMPTY_BRANDING: Branding = { companyName: "", phone: "", email: "", address: "", abn: "", accent: "", logo: null };

export function isBranded(b: Branding): boolean {
  return Boolean(b.companyName.trim() || b.logo || b.phone.trim() || b.email.trim() || b.address.trim() || b.abn.trim());
}

export function loadBranding(): Branding {
  try {
    const r = brandingSchema.safeParse(JSON.parse(window.localStorage.getItem(scopedKey(BRANDING_KEY)) ?? "null"));
    return r.success ? r.data : EMPTY_BRANDING;
  } catch {
    return EMPTY_BRANDING;
  }
}

/** Returns false if storage is unavailable or full (e.g. a large logo). */
export function saveBranding(b: Branding): boolean {
  try {
    window.localStorage.setItem(scopedKey(BRANDING_KEY), JSON.stringify(brandingSchema.parse(b)));
    return true;
  } catch {
    return false;
  }
}

export type LogoCheck = { ok: true; format: Logo["format"]; mime: "image/png" | "image/jpeg" } | { ok: false; error: string };

/** Checks a logo file's size and real format from its first bytes (PNG or JPEG only). */
export function checkLogoBytes(bytes: Uint8Array, size = bytes.length): LogoCheck {
  if (size === 0) return { ok: false, error: "The file is empty." };
  if (size > MAX_LOGO_BYTES) return { ok: false, error: `Logo files must be ${Math.round(MAX_LOGO_BYTES / 1024)} KB or smaller.` };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return { ok: true, format: "PNG", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ok: true, format: "JPEG", mime: "image/jpeg" };
  return { ok: false, error: "Use a PNG or JPEG image for the logo." };
}

/** Largest size that fits `box` without stretching (aspect ratio kept). */
export function fitLogo(logo: { width: number; height: number }, box: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.min(box.w / logo.width, box.h / logo.height);
  return { w: logo.width * scale, h: logo.height * scale };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Reads and validates a logo file in the browser (format, size, decodable, dimensions). */
export async function readLogo(file: File): Promise<{ ok: true; logo: Logo } | { ok: false; error: string }> {
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: `Logo files must be ${Math.round(MAX_LOGO_BYTES / 1024)} KB or smaller.` };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "The file couldn't be read." };
  }
  const check = checkLogoBytes(bytes, file.size);
  if (!check.ok) return check;
  const dataUrl = `data:${check.mime};base64,${toBase64(bytes)}`;
  const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
  if (!size || !size.width || !size.height) return { ok: false, error: "The image couldn't be read. Try another PNG or JPEG file." };
  if (size.width > MAX_LOGO_PIXELS || size.height > MAX_LOGO_PIXELS) return { ok: false, error: `Logos must be at most ${MAX_LOGO_PIXELS} × ${MAX_LOGO_PIXELS} pixels.` };
  const logo = { dataUrl, format: check.format, width: size.width, height: size.height };
  return logoSchema.safeParse(logo).success ? { ok: true, logo } : { ok: false, error: "The image couldn't be used as a logo." };
}
