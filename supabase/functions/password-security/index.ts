import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const allowedOrigins = new Set([
  "https://scan-it-six.vercel.app",
  "https://scan-it-mohamed-e6dd.vercel.app",
  "https://scan-it-git-main-mohamed-e6dd.vercel.app"
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

async function isCompromised(password: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch("https://api.pwnedpasswords.com/range/" + prefix, {
    headers: { "Add-Padding": "true" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("HIBP lookup unavailable");
  const lines = (await response.text()).split(/\r?\n/);
  return lines.some(line => {
    const [candidate, count] = line.split(":");
    return candidate === suffix && Number(count) > 0;
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: cors });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new Response(JSON.stringify({ error: "يجب تسجيل الدخول أولًا." }), { status: 401, headers: cors });
    const body = await req.json();
    const password = typeof body?.password === "string" ? body.password : "";
    if (body?.action !== "change_password" || password.length < 12 || password.length > 1024) {
      return new Response(JSON.stringify({ error: "كلمة المرور لازم تكون 12 حرفًا على الأقل." }), { status: 400, headers: cors });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server configuration missing");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "جلسة الدخول غير صالحة. سجّل الدخول مرة أخرى." }), { status: 401, headers: cors });

    let compromised: boolean;
    try {
      compromised = await isCompromised(password);
    } catch (error) {
      console.error("password-security HIBP lookup failed", error instanceof Error ? error.message : "unknown error");
      return new Response(JSON.stringify({ error: "تعذر التحقق من أمان كلمة المرور حاليًا. حاول لاحقًا." }), { status: 503, headers: cors });
    }
    if (compromised) return new Response(JSON.stringify({ error: "كلمة المرور ظهرت في تسريبات سابقة. اختَر كلمة مرور مختلفة." }), { status: 400, headers: cors });

    const { error: updateError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
    if (updateError) throw updateError;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (error) {
    console.error("password-security failed", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: "تعذر تغيير كلمة المرور. حاول مرة أخرى." }), { status: 500, headers: cors });
  }
});
