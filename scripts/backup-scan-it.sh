#!/usr/bin/env bash
# Free, operator-run backup for Scan It. Requires PostgreSQL client tools and Supabase CLI.
# Never put credentials in this file or commit .env files.
set -Eeuo pipefail
umask 077

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL in your shell (never commit it)}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
: "${BACKUP_DIR:=./backups}"

command -v pg_dump >/dev/null || { echo "pg_dump is required" >&2; exit 1; }
command -v supabase >/dev/null || { echo "Supabase CLI is required for Storage listing/download" >&2; exit 1; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="${BACKUP_DIR}/scan-it-${stamp}"
mkdir -p "$dest"
chmod 700 "$dest"

echo "Creating schema + data dump..."
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-acl --file "$dest/database.dump"

echo "Saving bucket metadata (no secrets)..."
supabase storage ls --project-ref "$SUPABASE_PROJECT_REF" > "$dest/storage-root-list.txt"

# Storage object listing/download is intentionally performed bucket-by-bucket:
# Supabase CLI does not provide a portable recursive export for every version.
# Use the included manifest as a checklist and download every object via the
# authenticated Storage API/CLI before marking this backup complete.
cat > "$dest/STORAGE-RESTORE-CHECKLIST.txt" <<'EOF'
Bucket: scan-it-uploads (private)
[ ] Export complete object path manifest (including nested folders)
[ ] Download every object with authenticated access
[ ] Preserve exact object paths and content types
[ ] Verify file count and SHA-256 checksums
[ ] Restore objects into a non-production project/bucket
[ ] Verify signed URL access and deny unauthenticated direct access
EOF

sha256sum "$dest/database.dump" > "$dest/SHA256SUMS"
echo "Database dump created: $dest/database.dump"
echo "IMPORTANT: Storage backup is NOT complete until every checklist item is completed."
echo "Test restore only into an isolated disposable Supabase project:"
echo "  pg_restore --clean --if-exists --no-owner --no-acl --dbname \"\$STAGING_DB_URL\" \"$dest/database.dump\""
