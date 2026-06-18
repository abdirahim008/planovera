// Upload the curated roadway-drawing library blocks (built by
// scripts/gen-roads-drawings.mjs) into public.drawing_library_items.
//
// The full SVGs are far too large to paste into the Supabase SQL editor, so this
// inserts them directly with the SERVICE-ROLE key — which you supply via an env
// var; it is never read from a file and never leaves your machine.
//
// Usage (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<your service role key>"
//   node scripts/upload-roads-drawings.mjs
//
// The Supabase URL is read from NEXT_PUBLIC_SUPABASE_URL (env or .env.local).
// Re-running is safe: each item is matched by exact name and replaced.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
// Library asset folder under imports/ — defaults to the original road set; pass
// another (e.g. "roads-library-typical") as the first arg.
const libDir = process.argv[2] || "roads-library";
const OUT = join(root, "imports", libDir);

// ── Resolve credentials (URL from env/.env.local; key from env ONLY) ──────────
function readEnvLocal(key) {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return undefined;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL not found (env or .env.local).");
  process.exit(1);
}
if (!serviceKey) {
  console.error("✗ Set SUPABASE_SERVICE_ROLE_KEY in your shell env first:");
  console.error('    $env:SUPABASE_SERVICE_ROLE_KEY="..."   # PowerShell');
  process.exit(1);
}

const manifestPath = join(OUT, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`✗ ${manifestPath} not found. Run: node scripts/gen-roads-drawings.mjs (+ --merge)`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log(`Uploading ${manifest.length} roadway drawings to ${url} …\n`);

let ok = 0;
let failed = 0;
for (const item of manifest) {
  const svg = readFileSync(join(OUT, item.svgFile), "utf8");
  // Idempotent: drop any existing copy by exact name, then insert fresh.
  const del = await supabase.from("drawing_library_items").delete().eq("name", item.name);
  if (del.error) {
    console.error(`  ✗ ${item.name}: delete failed — ${del.error.message}`);
    failed++;
    continue;
  }
  const { error } = await supabase.from("drawing_library_items").insert({
    name: item.name,
    category: item.category,
    description: item.description,
    tags: item.tags,
    svg,
    thumbnail: item.thumbnail,
    author_name: "Planovera Library",
  });
  if (error) {
    console.error(`  ✗ ${item.name}: ${error.message}`);
    failed++;
  } else {
    console.log(`  ✓ ${item.name}  [${item.drawingNo}]  ${item.svgKB}KB`);
    ok++;
  }
}

console.log(`\nDone. ${ok} uploaded, ${failed} failed.`);
process.exit(failed ? 1 : 0);
