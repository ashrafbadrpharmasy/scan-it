# Scan It — Security Closure Report

**Assessment date:** 2026-11-01  
**Repository:** `ashrafbadrpharmasy/scan-it`  
**Working branch:** `security/hardening-followup-2026-11-01`  
**Supabase project:** `scan-it-store` (`uussqwspmjtzubgwixbh`)  
**Production deployment:** Not changed by this assessment.

> This is an evidence-based interim closure report. It is not a certification or penetration-test attestation. No item is marked passed unless an execution result is available.

## Executive result

**Overall: NOT CLOSED. Production deployment is blocked.** A free isolated Supabase branch is not available: the organization branch price lookup returned **$0.01344/hour**, and no existing branches were listed. A production backup and isolated restore could not be performed with the available connected tools. Consequently, no production database migrations or Edge Function deployments were applied.

### Critical stop check

- No service-role key was found in the inspected customer-facing `order.html` or employee-facing `staff.html` source snippets.
- The browser code contains a Supabase **publishable** key, which is designed to be public and is not a service-role secret.
- GitHub commit search for the literal term `service_role` returned zero matching commits. This is not a full historical secret scan; the repository history and all GitHub secrets were not exhaustively scanned.
- No confirmed customer-data leak was observed in the inspected sources. This is not proof that none exists.

## 1. Status table

| Area / check | Status | Evidence and limitation |
|---|---|---|
| Inventory public tables | ⚠️ Partial | Database catalog inspection previously identified seven public tables. |
| RLS enabled on public tables | ⚠️ Partial | The seven inspected public tables had RLS enabled. Full all-schema audit not completed. |
| RLS policies review | ⚠️ Partial | Policies inspected at catalog level; no authenticated role-matrix tests. |
| Customer isolation | ❌ Not tested | No disposable customer test account and isolated test environment. |
| Staff/manager/suspended role matrix | ❌ Not tested | No disposable test accounts. Real manager account was not used. |
| Prevent staff self-escalation | ⚠️ Partial | Trigger migration exists in working branch and was previously reported installed; no full PostgREST role-matrix test evidence in this run. |
| Rate-limit table direct access | ⚠️ Partial | RLS was enabled and no policies existed (default deny). Explicit deny migration prepared but NOT applied. |
| SECURITY DEFINER functions | ⚠️ Partial | Previously inspected function definitions/search_path/ACLs; no complete automated ACL test suite. |
| Archive deletion authorization | ⚠️ Partial | Deployed function verifies JWT and active owner/manager role. No negative/positive integration test with test accounts. |
| Leaked Password Protection | ❌ Not enabled | Supabase Security Advisor reports `auth_leaked_password_protection` disabled. |
| Password strength policy | ⚠️ Partial | Employee UI has an 8-character recovery prompt; server-side Auth password policy not verified/configured. |
| Password reset / session expiry / logout | ❌ Not tested | Requires test identities and browser session testing. |
| Login rate limiting | ❌ Not verified | No controlled repeated-login integration test. |
| Upload magic-byte validation | ❌ Not implemented/tested | Browser checks MIME/size can be bypassed; server-side content signature validation not demonstrated. |
| Storage private access | ⚠️ Partial | `scan-it-uploads` is private, max 10MB, MIME allowlist present. Full object-policy tests not run. |
| Signed URL lifetime | ⚠️ Partial | Employee UI currently requests 900 seconds (15 minutes). Not tested against unauthorized roles. |
| Security headers | ⚠️ Partial | `vercel.json` contains CSP, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS. Live response not verified here. |
| CSP without unsafe-inline | ❌ Not achieved | Current CSP permits `unsafe-inline` for scripts and styles. Inline scripts/styles exist in HTML; removing it blindly will break the app. |
| Unsafe links / target blank | ⚠️ Partial | `staff.html` uses URL validation for detail links and `rel="noopener noreferrer"`; full sink audit incomplete. |
| Tracking order-number escaping | ⚠️ Partial | Previously patched escaping exists in branch; full browser XSS test not run. |
| All innerHTML sinks | ❌ Not fully audited | Employee page still uses multiple `innerHTML` / `insertAdjacentHTML` templates. Several dynamic UUIDs are interpolated into HTML attributes/selectors. |
| XSS payload tests | ❌ Not run | No isolated live test environment. |
| SQL injection tests | ❌ Not run | No isolated live test environment; no destructive payloads run against production. |
| Edge Function inventory | ⚠️ Partial | Two deployed functions found: `track-order` (JWT verification disabled intentionally for public tracking) and `delete-archive-orders` (JWT required). |
| Track-order rate limiting | ⚠️ Partial | Function calls `consume_track_order_rate_limit` with limit 10; no live repeated-request test. |
| Track-order client IP source | ❌ Needs correction | Source trusts `x-forwarded-for` fallback; this can be spoofable depending on ingress/proxy chain. |
| Edge Function CORS | ❌ Needs correction | Both functions currently return `Access-Control-Allow-Origin: *`. |
| Delete function error disclosure | ⚠️ Partial | General catch is generic, but Storage failure response includes `error.message` in `details`. |
| Idempotency | ❌ Not demonstrated | No idempotency key/duplicate-request integration test. |
| Database backup | ❌ Not created | No `pg_dump` credentials/CLI execution available through current connected tools. |
| Storage backup | ❌ Not created | No complete object manifest/download/restore was executed. |
| Restore test | ❌ Not run | No free staging Supabase environment available. |
| GitHub/Vercel secret audit | ⚠️ Partial | No full secrets inventory/history scan; only source review and limited commit search. |
| Mobile/desktop workflow | ❌ Not tested | No real browser/device automation run. |
| Live production headers and order flow | ❌ Not tested | No live production smoke test performed in this run. |
| Supabase Security Advisor | ⚠️ Partial | Known warning: leaked-password protection disabled. INFO: rate-limit table has RLS enabled but no policies. |

## 2. Changes and artifacts

### Existing working-branch changes
- `staff.html`: safe HTTP(S) URL handling in order detail links.
- `order.html`: escaped order number in tracking output.
- `tests/security-static.test.mjs`: static security regression checks.
- `.github/workflows/security-static.yml`: Node test workflow.
- `supabase/migrations/202611010001_prevent_self_staff_privilege_changes.sql`: trigger blocks an authenticated staff member from changing their own role, permissions, or active status.

### Added during this continuation
- `supabase/migrations/202611010002_deny_api_access_track_order_rate_limits.sql`: explicit deny policy and revokes for `anon` and `authenticated`. **Prepared only; not applied.**
- `scripts/backup-scan-it.sh`: free operator-run pg_dump + Storage backup checklist. **Not executed; Storage export remains a manual completion item.**

### Deployed Edge Function source findings
- `track-order`: `cf-connecting-ip` is preferred, but falls back to `x-forwarded-for` and `x-real-ip`; CORS is wildcard.
- `delete-archive-orders`: JWT checked via `auth.getUser`; active `owner`/ `manager` role required; CORS wildcard; Storage error details are returned to the client.
- These deployed sources are managed in Supabase and were not present at the expected GitHub paths. No deployed function was changed.

## 3. Manual actions required

### A. Supabase Auth settings
1. Open Supabase Dashboard → Authentication → Settings → Password Security.
2. Enable **Leaked Password Protection** if the dashboard offers it for the current plan.
3. Set minimum password length to at least 12 characters and enable the strongest available complexity policy.
4. If leaked-password protection is plan-gated, do not assume a client-side common-password list is equivalent. Keep the strong minimum/complexity policy and document the residual risk; use a server-side denylist only if it can be maintained without exposing password data.

### B. Isolated test environment
1. Do not create the four test accounts in production until an isolated test project exists.
2. Supabase Dashboard → create a disposable project only if the plan/credit allows it at no charge; current branch pricing lookup was $0.01344/hour, so Supabase database branching is not a free option here.
3. If no free project is available, use a local Supabase stack (Docker + Supabase CLI) and seed four identities with random passwords. Do not reuse production users.
4. Run RLS tests for client, staff, manager, and suspended staff, including SELECT/INSERT/UPDATE/DELETE for each table. Delete test identities and seed data after testing.

### C. Backup and restore
1. Install PostgreSQL client tools and Supabase CLI on a trusted workstation.
2. Set `SUPABASE_DB_URL` and `SUPABASE_PROJECT_REF` as shell environment variables; never paste credentials into chat or commit them.
3. Run `bash scripts/backup-scan-it.sh`.
4. Complete the Storage checklist in the generated backup folder: export every object path, download all files, verify SHA-256 checksums.
5. Restore the database dump and files into an isolated local/staging environment.
6. Verify row counts, object counts, MIME types, signed URL behavior, and a complete test order before treating the backup as proven.

### D. GitHub and Vercel
1. GitHub → Settings → Secrets and variables → Actions: inspect every secret name and rotate any credential ever committed or exposed. Never paste secret values into issues, logs, or chat.
2. Run GitHub secret scanning / push protection if available on the repository plan; independently scan all git history locally with a secret scanner.
3. Vercel → Project → Settings → Environment Variables: verify service-role key exists only in server/Edge Function secrets and is never prefixed with a public/client variable name.
4. Restrict production deployment permissions to trusted maintainers; verify preview deployments do not receive production-only secrets.

### E. CSP follow-up
1. Do not remove `unsafe-inline` before refactoring inline scripts and style attributes or adding a correctly generated nonce/hash strategy.
2. Move inline JavaScript to versioned external files, remove inline event handlers, then enforce a strict script-src without `unsafe-inline`.
3. Move inline styles to CSS files or apply narrowly scoped style hashes/nonces where supported.
4. Test every form, navigation action, upload, tracking request, and employee dashboard action against the strict CSP before production rollout.

## 4. Residual risks

- No complete isolated role/RLS integration test has been run.
- No confirmed backup/restore exists from this assessment.
- Storage upload validation currently relies partly on client-side metadata; magic-byte validation is not established.
- Wildcard CORS remains on both deployed Edge Functions.
- Public tracking endpoint is unauthenticated by design; its IP rate-limit identity needs trusted-ingress verification.
- Employee dashboard contains dynamic HTML templates; static review found raw database IDs inserted into some DOM identifiers/attributes. Validate UUIDs or escape consistently before considering XSS closure complete.
- CSP still permits inline script/style execution.
- Leaked Password Protection remains disabled according to Advisor.
- No live browser test or post-deploy smoke test was run.
- No production deployment or database migration was performed.

## 5. Closure gates

| Gate | Result |
|---|---|
| Database and RLS | **NOT PASSED** |
| Staff and permissions | **NOT PASSED** |
| Files and Storage | **NOT PASSED** |
| Website and API | **NOT PASSED** |
| Backup and restore | **NOT PASSED** |
| Production deployment | **NOT PASSED — intentionally blocked** |

## 6. Rollback notes

- Git/Vercel: retain the currently serving production deployment; if a later verified release fails, use Vercel → Deployments → previous successful production deployment → Promote/Rollback.
- Database: do not apply a migration until its pre-change schema/ACL snapshot and rollback are stored. The prepared rate-limit migration rollback removes the explicit deny policy; it intentionally does not re-grant privileges automatically because the exact prior ACL must first be captured.
- Trigger rollback: drop trigger `prevent_self_staff_privilege_changes` and then drop function `public.prevent_self_staff_privilege_changes()` only if a verified rollback is required and the previous ACL/behavior has been documented.

---

**Final assessment:** The requested seven-stage closure cannot honestly be marked complete with the current access and free-tier constraints. Production was left unchanged. The artifacts above prepare the next safe steps, but do not substitute for a tested isolated environment, verified backup/restore, deployed Edge Function fixes, or live regression tests.
