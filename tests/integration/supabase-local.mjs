import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase environment missing");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID().slice(0, 8);
const password = "LocalOnly-" + crypto.randomUUID() + "-Aa9!";
const users = {};
const created = [];
const accounts = [
  ["test_customer1", "customer1"],
  ["test_customer2", "customer2"],
  ["test_staff", "staff"],
  ["test_admin", "admin"],
  ["test_suspended", "suspended"],
  ["test_newemployee", "newemployee"]
];

async function createAccount(name) {
  const email = `${name}-${suffix}@scan-it.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  created.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  users[name] = { id: data.user.id, client, token: signed.data.session.access_token };
}
try {
  for (const [name] of accounts) await createAccount(name);

  const staffRows = [
    { user_id: users.test_staff.id, display_name: "Test Staff", role: "employee", permissions: ["orders"], active: true },
    { user_id: users.test_admin.id, display_name: "Test Admin", role: "manager", permissions: ["orders","payments","products","settings","employees"], active: true },
    { user_id: users.test_suspended.id, display_name: "Test Suspended", role: "employee", permissions: ["orders","employees"], active: false }
  ];
  const seedStaff = await admin.from("staff_members").insert(staffRows);
  assert.ifError(seedStaff.error);

  const bucket = "scan-it-uploads";
  const bucketCreate = await admin.storage.createBucket(bucket, {
    public: false, fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg","image/png","image/webp","image/gif","application/pdf"]
  });
  if (bucketCreate.error && !/already exists/i.test(bucketCreate.error.message)) throw bucketCreate.error;

  const orderInsert = await admin.from("orders").insert({
    order_number: "SI-" + suffix.toUpperCase().padEnd(8, "0").slice(0,8),
    customer_name: "Synthetic Test Customer", business_name: "Synthetic Test Shop",
    phone: "0000000000", service_type: "all_links", social_links: {}, extra_links: [],
    menu_file_paths: [], notes: "Synthetic CI fixture", acrylic_nfc: false, items: [],
    subtotal: 0, deposit_amount: 0, remaining_amount: 0, payment_method: "instapay",
    payment_proof_path: "customer-uploads/" + suffix + "/proof.png",
    payment_status: "proof_submitted", order_status: "pending", staff_notes: "", public_status_note: ""
  }).select("id").single();
  assert.ifError(orderInsert.error);
  const orderId = orderInsert.data.id;

  for (const name of ["test_customer1","test_customer2"]) {
    const result = await users[name].client.from("orders").select("id");
    assert.ifError(result.error);
    assert.equal(result.data.length, 0, name + " must not read another customer's order");
  }
  const anonOrders = await anon.from("orders").select("id");
  assert.ifError(anonOrders.error);
  assert.equal(anonOrders.data.length, 0, "anon must not read orders");

  const staffOrders = await users.test_staff.client.from("orders").select("id").eq("id", orderId);
  assert.ifError(staffOrders.error);
  assert.equal(staffOrders.data.length, 1, "active orders staff should read orders");

  const suspendedPermission = await users.test_suspended.client.rpc("has_staff_permission", { permission_name: "orders" });
  assert.ifError(suspendedPermission.error);
  assert.equal(suspendedPermission.data, false, "suspended staff must have no permissions");

  const selfEscalation = await users.test_staff.client.from("staff_members")
    .update({ role: "manager", permissions: ["employees"], active: true }).eq("user_id", users.test_staff.id);
  assert.ok(selfEscalation.error, "staff self privilege escalation must be denied");

  const employeeInsert = await users.test_staff.client.from("staff_members").insert({
    user_id: users.test_newemployee.id, display_name: "Forbidden Staff", role: "employee", permissions: [], active: true
  });
  assert.ok(employeeInsert.error, "non-manager must not add staff");

  const managerInsert = await users.test_admin.client.from("staff_members").insert({
    user_id: users.test_newemployee.id, display_name: "Test New Employee", role: "employee", permissions: [], active: true
  });
  assert.ifError(managerInsert.error);

  const filePath = "customer-uploads/" + suffix + "/proof.png";
  const fakePng = new TextEncoder().encode("not actually a PNG file");
  const upload = await admin.storage.from(bucket).upload(filePath, fakePng, { contentType: "image/png" });
  assert.ifError(upload.error);

  const anonDownload = await anon.storage.from(bucket).download(filePath);
  assert.ok(anonDownload.error, "anon must not directly read private customer uploads");
  const customerDownload = await users.test_customer1.client.storage.from(bucket).download(filePath);
  assert.ok(customerDownload.error, "customer must not directly read another customer's upload");
  const staffDownload = await users.test_staff.client.storage.from(bucket).download(filePath);
  assert.ifError(staffDownload.error);

  const signed = await admin.storage.from(bucket).createSignedUrl(filePath, 900);
  assert.ifError(signed.error);
  const signedResponse = await fetch(signed.data.signedUrl);
  assert.equal(signedResponse.status, 200, "signed URL should be retrievable");

  const tooLarge = await admin.storage.from(bucket).upload("customer-uploads/" + suffix + "/too-large.png", new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "image/png" });
  assert.ok(tooLarge.error, "oversized file must be rejected");
  const wrongMime = await admin.storage.from(bucket).upload("customer-uploads/" + suffix + "/wrong.txt", new TextEncoder().encode("plain text"), { contentType: "text/plain" });
  assert.ok(wrongMime.error, "disallowed MIME type must be rejected");

  // Storage validates declared MIME metadata but not the file signature in this setup.
  // The fake PNG upload above is an explicit regression finding, not a pass.
  const archiveUpdate = await admin.from("orders").update({ order_status: "delivered" }).eq("id", orderId);
  assert.ifError(archiveUpdate.error);
  const staffDelete = await fetch(url + "/functions/v1/delete-archive-orders", {
    method: "POST", headers: { Authorization: "Bearer " + users.test_staff.token, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ order_ids: [orderId] })
  });
  assert.equal(staffDelete.status, 403, "non-manager must not delete archive orders");
  const adminDelete = await fetch(url + "/functions/v1/delete-archive-orders", {
    method: "POST", headers: { Authorization: "Bearer " + users.test_admin.token, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ order_ids: [orderId] })
  });
  assert.equal(adminDelete.status, 200, "manager should delete synthetic archived order");
  const deleted = await admin.from("orders").select("id").eq("id", orderId);
  assert.ifError(deleted.error);
  assert.equal(deleted.data.length, 0, "synthetic archived order should be deleted");
  console.log("RLS/Auth/Storage/archive integration checks completed. NOTE: MIME-spoofed non-image bytes were accepted as image/png; server-side signature validation is still required.");
} finally {
  // Best-effort cleanup is limited to identities created by this CI run.
  for (const id of created) await admin.auth.admin.deleteUser(id);
}
