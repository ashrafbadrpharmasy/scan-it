import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const root = path.resolve(process.env.STORAGE_BACKUP_DIR || "/tmp/scan-it-storage");
if (!url || !key) throw new Error("Storage backup credentials are not configured");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = "scan-it-uploads";
const entries = [];

async function walk(prefix = "") {
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("Storage listing failed: " + error.message);
    for (const item of data || []) {
      const objectPath = prefix ? prefix + "/" + item.name : item.name;
      if (item.id === null) {
        await walk(objectPath);
        continue;
      }
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(objectPath);
      if (downloadError || !blob) throw new Error("Storage download failed for an object: " + (downloadError?.message || "empty response"));
      const bytes = Buffer.from(await blob.arrayBuffer());
      const target = path.resolve(root, objectPath);
      if (!target.startsWith(root + path.sep)) throw new Error("Unsafe object path rejected");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
      entries.push({ path: objectPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    if (!data || data.length < 100) break;
    offset += data.length;
  }
}
await walk();
await mkdir(root, { recursive: true });
await writeFile(path.join(root, "manifest.json"), JSON.stringify({ bucket, count: entries.length, objects: entries }, null, 2), { flag: "wx" });
console.log("Encrypted Storage export prepared; object count:", entries.length);
