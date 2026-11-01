import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "/tmp/scan-it-restore/storage");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (!Array.isArray(manifest.objects) || manifest.count !== manifest.objects.length) throw new Error("Storage manifest count mismatch");
for (const item of manifest.objects) {
  const file = path.resolve(root, item.path);
  if (!file.startsWith(root + path.sep)) throw new Error("Unsafe path in Storage manifest");
  const bytes = await readFile(file);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== item.bytes || digest !== item.sha256) throw new Error("Storage checksum mismatch for an object");
}
console.log("Storage restore verification passed; objects:", manifest.count);
