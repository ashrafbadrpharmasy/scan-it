import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const allowedOrigins = new Set(["https://scan-it-six.vercel.app","https://scan-it-mohamed-e6dd.vercel.app","https://scan-it-git-main-mohamed-e6dd.vercel.app"]);
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
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  try {
    const body = await req.json();
    const orderNumber = String(body?.order_number || "").trim().toUpperCase();
    if (!/^SI-[A-F0-9]{8}$/.test(orderNumber)) {
      return new Response(JSON.stringify({ error: "رقم الطلب غير صحيح." }), { status: 400, headers: cors });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Server configuration missing");

    // Trust only the Cloudflare ingress header. Never accept client-supplied X-Forwarded-For.
    // If the platform does not supply it, use one shared fallback bucket (fail closed).
    const trustedIp = req.headers.get("cf-connecting-ip")?.trim();
    const sb = createClient(url, key, { auth: { persistSession: false } });

    const ipHash = await sha256(trustedIp ? "ip:" + trustedIp : "ip:unknown");
    const { data: ipAllowed, error: ipError } = await sb.rpc("consume_track_order_rate_limit", {
      p_ip_hash: ipHash, p_limit: 10
    });
    if (ipError) throw ipError;
    if (ipAllowed !== true) return new Response(JSON.stringify({ error: "تم إجراء محاولات كتير في وقت قصير. استنى دقيقة وجرب تاني." }), {
      status: 429, headers: { ...cors, "Retry-After": "60" }
    });

    // Secondary independent bucket per order number limits distributed guessing of one order.
    const orderHash = await sha256("order:" + orderNumber);
    const { data: orderAllowed, error: orderError } = await sb.rpc("consume_track_order_rate_limit", {
      p_ip_hash: orderHash, p_limit: 5
    });
    if (orderError) throw orderError;
    if (orderAllowed !== true) return new Response(JSON.stringify({ error: "تم تجاوز عدد محاولات التتبع لهذا الرقم. حاول بعد دقيقة." }), {
      status: 429, headers: { ...cors, "Retry-After": "60" }
    });

    const { data, error } = await sb.from("orders")
      .select("order_number,order_status,public_status_note,created_at,updated_at")
      .eq("order_number", orderNumber).maybeSingle();
    if (error) throw error;
    if (!data) return new Response(JSON.stringify({ error: "ملقيناش طلب بالرقم ده. راجع الرقم وجرب تاني." }), { status: 404, headers: cors });
    return new Response(JSON.stringify({ order: data }), { status: 200, headers: cors });
  } catch (error) {
    console.error("track-order failed", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: "حصلت مشكلة أثناء التتبع. حاول مرة تانية." }), { status: 500, headers: cors });
  }
});