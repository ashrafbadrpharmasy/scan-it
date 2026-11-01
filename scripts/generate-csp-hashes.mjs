import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const pages = ["index.html", "order.html", "staff.html"];
const scriptSources = new Set();
const styleSources = new Set();
const decode = value => value
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const hash = value => "'sha256-" + createHash("sha256").update(value, "utf8").digest("base64") + "'";

for (const page of pages) {
  const html = await readFile(new URL("../" + page, import.meta.url), "utf8");
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) scriptSources.add(hash(match[2]));
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (match[1].trim()) styleSources.add(hash(match[1]));
  }
  for (const match of html.matchAll(/\son[a-z]+\s*=\s*(["'])(.*?)\1/gi)) {
    scriptSources.add(hash(decode(match[2])));
  }
  for (const match of html.matchAll(/\sstyle\s*=\s*(["'])(.*?)\1/gi)) {
    styleSources.add(hash(decode(match[2])));
  }
}
for (const dynamicStyle of ["width:auto", "margin-top:10px"]) styleSources.add(hash(dynamicStyle));
console.log("CSP_SCRIPT_HASHES=" + [...scriptSources].sort().join(" "));
console.log("CSP_STYLE_HASHES=" + [...styleSources].sort().join(" "));
