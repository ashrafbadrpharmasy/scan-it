import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const allowedOrigins = new Set([
  "https://scan-it-six.vercel.app",
  "https://scan-it-mohamed-e6dd.vercel.app",
  "https://scan-it-git-main-mohamed-e6dd.vercel.app"
]);
const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string,string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};

function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return "image/png";
  if (bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if (bytes.length >= 6) {
    const signature = new TextDecoder().decode(bytes.slice(0,6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4))==="RIFF" && new TextDecoder().decode(bytes.slice(8,12))==="WEBP") return "image/webp";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0,5))==="%PDF-") return "application/pdf";
  return null;
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  if (req.method !== "POST") return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:cors});
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return new Response(JSON.stringify({error:"Origin not allowed"}),{status:403,headers:cors});
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Server configuration missing");
    const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const trustedIp = req.headers.get("cf-connecting-ip")?.trim() || "unknown";
    const ipHash = await sha256("upload-ip:"+trustedIp);
    const {data:allowed,error:rateError}=await admin.rpc("consume_track_order_rate_limit",{p_ip_hash:ipHash,p_limit:20});
    if(rateError)throw rateError;
    if(allowed!==true)return new Response(JSON.stringify({error:"طلبات رفع كثيرة في وقت قصير. حاول بعد دقيقة."}),{status:429,headers:{...cors,"Retry-After":"60"}});
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return new Response(JSON.stringify({error:"ملف الرفع غير موجود."}),{status:400,headers:cors});
    if(file.size<1 || file.size>10*1024*1024)return new Response(JSON.stringify({error:"حجم الملف يجب ألا يتجاوز 10MB."}),{status:413,headers:cors});
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectMime(bytes);
    const declared = file.type.toLowerCase();
    if(!detected || detected!==declared)return new Response(JSON.stringify({error:"نوع الملف أو محتواه غير مدعوم."}),{status:415,headers:cors});
    const extension = ({ "image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","application/pdf":"pdf" } as Record<string,string>)[detected];
    const path = "customer-uploads/"+crypto.randomUUID()+"/upload."+extension;
    const {error:uploadError}=await admin.storage.from("scan-it-uploads").upload(path,bytes,{contentType:detected,upsert:false});
    if(uploadError)throw uploadError;
    return new Response(JSON.stringify({path}),{status:201,headers:cors});
  } catch(error) {
    console.error("secure-upload failed",error instanceof Error?error.message:"unknown error");
    return new Response(JSON.stringify({error:"تعذر رفع الملف. حاول مرة أخرى."}),{status:500,headers:cors});
  }
});
