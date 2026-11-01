import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("customer upload sends explicit content type and unique path", async () => {
  const html = await read("order.html");
  assert.match(html, /crypto\.randomUUID\(\)/);
  assert.match(html, /contentType:f\.type/);
  assert.match(html, /upsert:false/);
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
  assert.equal(values["x-frame-options"], "DENY");
  assert.match(values["content-security-policy"], /object-src 'none'/);
  assert.match(values["content-security-policy"], /frame-ancestors 'none'/);
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
  assert.match(html, /value=\''\+esc\(x\.name_ar\)/);
  assert.match(html, /esc\(x\.display_name\)/);
});
