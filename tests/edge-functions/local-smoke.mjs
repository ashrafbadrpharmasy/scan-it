import assert from "node:assert/strict";

const base = "http://127.0.0.1:54321/functions/v1";
const origin = "https://scan-it-six.vercel.app";

const preflight = await fetch(base + "/track-order", {
  method: "OPTIONS",
  headers: { Origin: origin, "Access-Control-Request-Method": "POST" }
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("vary"), "Origin");
assert.equal(preflight.headers.get("access-control-allow-origin"), origin);

const deniedOrigin = await fetch(base + "/track-order", {
  method: "OPTIONS",
  headers: { Origin: "https://attacker.invalid", "Access-Control-Request-Method": "POST" }
});
assert.equal(deniedOrigin.headers.get("access-control-allow-origin"), null);

const invalidTracking = await fetch(base + "/track-order", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ order_number: "not-an-order" })
});
assert.equal(invalidTracking.status, 400);

const noAuthDelete = await fetch(base + "/delete-archive-orders", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ order_ids: [] })
});
assert.equal(noAuthDelete.status, 401);

const noAuthPassword = await fetch(base + "/password-security", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "change_password", password: "not-a-real-password" })
});
assert.equal(noAuthPassword.status, 401, "password changes must require an authenticated recovery session");

for (const name of ["delete-archive-orders", "password-security", "secure-upload"]) {
  const corsCheck = await fetch(base + "/" + name, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
  assert.equal(corsCheck.headers.get("vary"), "Origin");
  assert.equal(corsCheck.headers.get("access-control-allow-origin"), origin);
}

console.log("Local Edge Function smoke checks passed: CORS allow/deny, invalid tracking input, unauthenticated archive delete.");


if (process.env.DATABASE_URL) {
  const attempts = [];
  for (let i = 0; i < 6; i++) {
    attempts.push(await fetch(base + "/track-order", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.77" },
      body: JSON.stringify({ order_number: "SI-FFFFFFFF" })
    }));
  }
  assert.equal(attempts[5].status, 429, "per-order tracking rate limit must block the sixth attempt");

  const spoofed = new FormData();
  spoofed.append("file", new Blob(["this is not a PNG"], { type: "image/png" }), "spoof.png");
  const rejectedUpload = await fetch(base + "/secure-upload", {
    method: "POST",
    headers: { Origin: origin, apikey: process.env.ANON_KEY || "" },
    body: spoofed
  });
  assert.equal(rejectedUpload.status, 415, "upload endpoint must reject MIME-spoofed content");
  console.log("Secure upload rejected a file whose declared MIME did not match its byte signature.");
} else {
  console.log("SKIP secure-upload content test: DATABASE_URL secret absent, so local production schema and rate-limit RPC were not imported.");
}
