/**
 * Static build for Cloudflare Pages: `next build` with output "export" into
 * out/, then out/_headers generated from src/lib/security-headers.ts (static
 * hosts ignore next.config headers), then a check that every route and PWA
 * file is present. Fails loudly instead of publishing an incomplete site.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = process.cwd();
const out = join(root, "out");

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, FIELDWISE_STATIC_EXPORT: "true" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

// Load the header definitions (a dependency-free TypeScript module) without a bundler.
const source = readFileSync(join(root, "src/lib/security-headers.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { cloudflareHeadersFile } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
writeFileSync(join(out, "_headers"), cloudflareHeadersFile());

// Every page in src/app must be in the export: static pages as <route>.html, dynamic ones with at least one file.
function pages(dir, route = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("(")) continue;
    found.push(...pages(join(dir, entry.name), `${route}/${entry.name}`));
  }
  if (existsSync(join(dir, "page.tsx"))) found.push(route || "/");
  return found;
}
const routes = pages(join(root, "src/app"));
const required = [
  "404.html", "_headers", "robots.txt", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/icon.svg",
  "fonts/Carlito-Regular.ttf", "fonts/FieldwiseSymbols.ttf",
];
for (const route of routes) {
  const dynamic = route.match(/^(.*?)\/\[[^\]]+\]/);
  if (!dynamic) required.push(route === "/" ? "index.html" : `${route.slice(1)}.html`);
  else if (!readdirSync(join(out, dynamic[1].slice(1))).some((f) => f.endsWith(".html"))) required.push(`${dynamic[1].slice(1)}/<at least one page>.html`);
}
const missing = required.filter((f) => !existsSync(join(out, f)));
if (missing.length) {
  console.error(`Static export is incomplete. Missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Static site ready in out/: ${routes.length} routes and ${required.length} files checked, _headers written.`);
