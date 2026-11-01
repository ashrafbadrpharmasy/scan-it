import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("staff UI escapes untrusted text before HTML insertion", async () => {
  const html = await read("staff.html");
  assert.match(html, /const esc\s*=\s*x\s*=>\s*String\(x\?\?''\)\.replace/);
  assert.match(html, /const safeHttpUrl\s*=\s*value\s*=>/);
});

test("staff order details only turn validated HTTP(S) values into links", async () => {
  const html = await read("staff.html");
  assert.match(html, /\['https:',\s*'http:'\]\.includes\(u\.protocol\)/);
  assert.match(html, /const safeHref\s*=\s*safeHttpUrl\(x\.href\)/);
});

test("employee management UI checks employee permission before writes", async () => {
  const html = await read("staff.html");
  assert.match(html, /employeeForm'\)\.onsubmit[\s\S]{0,180}if\(!can\('employees'\)\)return/);
});

test("customer upload enforces size and requires a file", async () => {
  const html = await read("order.html");
  assert.match(html, /if\(!f\)throw new Error/);
  assert.match(html, /f\.size>10\*1024\*1024/);
});

test("customer upload is routed through the server-side signature validator", async () => {
  const html = await read("order.html");
  const fn = await read("supabase/functions/secure-upload/index.ts");
  assert.match(html, /functions\.invoke\('secure-upload'/);
  assert.doesNotMatch(html, /storage\.from\('scan-it-uploads'\)\.upload/);
  assert.match(fn, /detectMime\(bytes\)/);
  assert.match(fn, /detected!==declared/);
  assert.match(fn, /upsert:false/);
  assert.match(fn, /Vary/);
});

test("tracking page calls the public tracking function without rendering raw HTML from API", async () => {
  const html = await read("order.html");
  assert.match(html, /functions\/v1\/track-order/);
  assert.match(html, /box\.textContent\s*=\s*'جاري البحث/);
  assert.match(html, /public_status_note/);
  assert.match(html, /const safeNumber=String\(o\.order_number\|\|''\)\.replace/);
  assert.match(html, /رقم الأوردر: '\+safeNumber\+'/);
});

test("Vercel security headers include baseline protections", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const headers = config.headers.flatMap((entry) => entry.headers || []);
  const values = Object.fromEntries(headers.map((h) => [h.key.toLowerCase(), h.value]));
  assert.equal(values["x-content-type-options"], "nosniff");
  assert.equal(values["x-permitted-cross-domain-policies"], "none");
  assert.equal(values["x-dns-prefetch-control"], "off");
  assert.equal(values["cross-origin-opener-policy"], "same-origin");
  assert.equal(values["x-frame-options"], "DENY");
  assert.match(values["content-security-policy"], /object-src 'none'/);
  assert.match(values["content-security-policy"], /frame-ancestors 'none'/);
  assert.doesNotMatch(values["content-security-policy"], /unsafe-inline/);
  assert.match(values["content-security-policy"], /script-src-attr 'unsafe-hashes'/);
  assert.match(values["content-security-policy"], /style-src-attr 'unsafe-hashes'/);
  assert.match(values["strict-transport-security"], /max-age=/);
});


test("tracking per-order rate limit is scoped to a trusted client and cannot be globally exhausted", async () => {
  const fn = await read("supabase/functions/track-order/index.ts");
  assert.match(fn, /if\s*\(trustedIp\)\s*\{[\s\S]*?sha256\("order:"\s*\+\s*orderNumber\s*\+\s*":"\s*\+\s*ipHash\)/);
  assert.doesNotMatch(fn, /sha256\("order:"\s*\+\s*orderNumber\s*\)/);
});

test("dynamic InstaPay URL from settings is restricted to HTTPS", async () => {
  const html = await read("order.html");
  assert.match(html, /new URL\(String\(sd\.value\.instapay_url\)\)/);
  assert.match(html, /paymentUrl\.protocol==='https:'/);
  assert.doesNotMatch(html, /\.pay'\)\.href=sd\.value\.instapay_url/);
});

test("staff product names and employee names are escaped before insertion", async () => {
  const html = await read("staff.html");
  assert.match(html, /value="'\+esc\(x\.name_ar\)\+'/);
  assert.match(html, /esc\(x\.display_name\)/);
});


test("staff dashboard uses a strict DOM sanitizer and has no raw HTML insertion sinks", async () => {
  const html = await read("staff.html");
  assert.match(html, /function setSafeHtml\(target,html,append=false\)/);
  assert.match(html, /new DOMParser\(\)\.parseFromString/);
  assert.match(html, /safeHttpUrl\(value\)/);
  assert.doesNotMatch(html, /\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write/);
});

test("staff module parses successfully after security changes", async () => {
  const html = await read("staff.html");
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/i);
  assert.ok(match, "staff module script exists");
  const dir = await mkdtemp(join(tmpdir(), "scan-it-staff-"));
  const file = join(dir, "staff-module.mjs");
  try {
    await writeFile(file, match[1], "utf8");
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("password changes are routed through the HIBP Edge Function", async () => {
  const html = await read("staff.html");
  const fn = await read("supabase/functions/password-security/index.ts");
  assert.match(html, /functions\.invoke\('password-security'/);
  assert.doesNotMatch(html, /api\.pwnedpasswords\.com/);
  assert.match(fn, /api\.pwnedpasswords\.com\/range\//);
  assert.match(fn, /Add-Padding/);
  assert.match(fn, /updateUserById\(authData\.user\.id,\s*\{\s*password\s*\}\)/);
  assert.match(fn, /password\.length\s*<\s*12/);
});

test("Edge Functions enforce an origin allowlist and do not use wildcard CORS", async () => {
  for (const path of ["supabase/functions/track-order/index.ts","supabase/functions/delete-archive-orders/index.ts","supabase/functions/password-security/index.ts","supabase/functions/secure-upload/index.ts"]) {
    const fn = await read(path);
    assert.match(fn, /Vary/);
    assert.match(fn, /allowedOrigins\.has\(origin\)/);
    assert.doesNotMatch(fn, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
  }
});


test("storage upload migration removes direct customer inserts and preserves product staff uploads", async () => {
  const migration = await read("supabase/migrations/20261101120100_secure_storage_uploads.sql");
  assert.match(migration, /drop policy if exists "customers can upload their own checkout files"/);
  assert.match(migration, /product staff can upload product images/);
  assert.match(migration, /has_staff_permission\('products'\)/);
  const rollback = await read("supabase/rollback/202611010003_secure_storage_uploads.sql");
  assert.match(rollback, /customers can upload their own checkout files/);
});
