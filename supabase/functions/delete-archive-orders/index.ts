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

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new Response(JSON.stringify({ error: "يجب تسجيل الدخول أولًا." }), { status: 401, headers: cors });

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server configuration missing");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "جلسة الدخول غير صالحة. سجّل الدخول مرة أخرى." }), { status: 401, headers: cors });
    const actorId = authData.user.id;
    const { data: staff, error: staffError } = await admin.from("staff_members").select("role,active")
      .eq("user_id", actorId).maybeSingle();
    if (staffError) throw staffError;
    if (!staff?.active || !["owner", "manager"].includes(staff.role)) {
      return new Response(JSON.stringify({ error: "الحذف متاح للمدير فقط." }), { status: 403, headers: cors });
    }

    const body = await req.json();
    let orders: any[] = [];
    if (body?.all_archive === true) {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await admin.from("orders").select("id,order_number,payment_proof_path,logo_path,menu_file_paths")
          .eq("order_status", "delivered").order("created_at", { ascending: true }).range(offset, offset + 499);
        if (error) throw error;
        orders.push(...(data || []));
        if (!data || data.length < 500) break;
        if (orders.length > 20000) throw new Error("Archive batch exceeds safety cap");
      }
    } else {
      const ids = Array.isArray(body?.order_ids) ? [...new Set(body.order_ids)] : [];
      if (!ids.length || ids.length > 500 || ids.some((id: unknown) =>
        typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        return new Response(JSON.stringify({ error: "حدد من 1 إلى 500 طلب صحيح." }), { status: 400, headers: cors });
      }
      const { data, error } = await admin.from("orders").select("id,order_number,payment_proof_path,logo_path,menu_file_paths")
        .in("id", ids).eq("order_status", "delivered");
      if (error) throw error;
      orders = data || [];
      if (orders.length !== ids.length) return new Response(JSON.stringify({ error: "بعض الطلبات المحددة ليست في الأرشيف أو لم تعد موجودة. حدّث الصفحة وحاول مرة أخرى." }), { status: 409, headers: cors });
    }

    if (!orders.length) return new Response(JSON.stringify({ deleted_orders: 0, deleted_files: 0, message: "الأرشيف فاضي بالفعل." }), { status: 200, headers: cors });

    const ids = orders.map(o => o.id);
    const paymentPathsByOrder = new Map<string, string[]>();
    for (let orderOffset = 0; orderOffset < ids.length; orderOffset += 500) {
      const orderBatch = ids.slice(orderOffset, orderOffset + 500);
      for (let rowOffset = 0; ; rowOffset += 500) {
        const { data, error } = await admin.from("payment_records").select("order_id,proof_path")
          .in("order_id", orderBatch).range(rowOffset, rowOffset + 499);
        if (error) throw error;
        for (const record of data || []) if (record.proof_path) {
          const existing = paymentPathsByOrder.get(record.order_id) || [];
          existing.push(record.proof_path);
          paymentPathsByOrder.set(record.order_id, existing);
        }
        if (!data || data.length < 500) break;
      }
    }

    const pathsByOrder = new Map<string, string[]>();
    for (const order of orders) {
      const paths = [order.payment_proof_path, order.logo_path,
        ...(Array.isArray(order.menu_file_paths) ? order.menu_file_paths : []),
        ...(paymentPathsByOrder.get(order.id) || [])]
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
      pathsByOrder.set(order.id, [...new Set(paths)]);
    }
    const paths = [...new Set([...pathsByOrder.values()].flat())];
    let deletedFiles = 0;
    for (let offset = 0; offset < paths.length; offset += 1000) {
      const batch = paths.slice(offset, offset + 1000);
      const { data, error } = await admin.storage.from("scan-it-uploads").remove(batch);
      if (error) {
        console.error("delete-archive-orders storage removal failed", { message: error.message, removedCount: deletedFiles });
        return new Response(JSON.stringify({ error: "لم نكمل الحذف لأن Storage رفض حذف بعض الملفات. لم نحذف سجلات الطلبات؛ راجع التخزين وحاول مرة أخرى." }), { status: 502, headers: cors });
      }
      deletedFiles += data?.length ?? batch.length;
    }

    let deletedOrders = 0;
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await admin.from("orders").delete()
        .in("id", ids.slice(offset, offset + 100)).eq("order_status", "delivered").select("id");
      if (error) throw error;
      deletedOrders += data?.length ?? 0;
    }

    let auditLogged = true;
    for (let offset = 0; offset < orders.length; offset += 500) {
      const auditRows = orders.slice(offset, offset + 500).map(order => ({
        actor_id: actorId, action: "archived_order_deleted", entity_type: "order", entity_id: order.id,
        details: { order_number: order.order_number, storage_files_removed: pathsByOrder.get(order.id)?.length ?? 0 }
      }));
      const { error } = await admin.from("audit_logs").insert(auditRows);
      if (error) { console.error("delete-archive-orders audit insert failed", error.message); auditLogged = false; }
    }
    return new Response(JSON.stringify({
      deleted_orders: deletedOrders, deleted_files: deletedFiles, audit_logged: auditLogged,
      message: auditLogged ? "تم حذف الطلبات وملفاتها من الأرشيف." : "تم الحذف، لكن تعذر تسجيل بعض تفاصيل سجل المراجعة."
    }), { status: 200, headers: cors });
  } catch (error) {
    console.error("delete-archive-orders failed", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: "حصلت مشكلة أثناء حذف الأرشيف. حاول مرة أخرى." }), { status: 500, headers: cors });
  }
});