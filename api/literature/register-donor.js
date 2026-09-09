import { createClient } from "@supabase/supabase-js";

function validEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value ?? "").trim());
}

function appUrl(req) {
  return String(
    process.env.DISCOVER_BIBLE_SCHOOL_APP_URL ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
  ).replace(/\/$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.VITE_SUPABASE_URL || !serviceRoleKey) {
    return res.status(503).json({ error: "Literature registration is not configured." });
  }
  const payload = req.body ?? {};
  const sourceType = String(payload.sourceType ?? "").trim();
  const displayName = String(payload.displayName ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const state = String(payload.state ?? "").trim();
  const lgaCity = String(payload.lgaCity ?? "").trim();
  if (!['individual','church','ministry','institution','organization'].includes(sourceType) || displayName.length < 2 || !validEmail(email) || !state || !lgaCity) {
    return res.status(400).json({ error: "Provide a valid donor type, name, email, state, and LGA/city." });
  }
  const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return res.status(409).json({ error: "An account already uses this email address. Please sign in instead." });
  const { data: invitation, error: invitationError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: displayName, role: "donor" },
    redirectTo: `${appUrl(req)}/literature/login?type=invite`,
  });
  if (invitationError || !invitation.user) return res.status(400).json({ error: invitationError?.message || "The secure donor invitation could not be created." });
  const profileId = invitation.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert({ id: profileId, email, full_name: displayName, phone: String(payload.whatsapp ?? "").trim() || null, role: "donor", status: "active" });
  if (profileError) return res.status(500).json({ error: profileError.message });
  const { error: sourceError } = await supabase.from("literature_sources").insert({
    profile_id: profileId,
    source_type: sourceType,
    display_name: displayName,
    contact_name: String(payload.contactName ?? "").trim() || null,
    email,
    whatsapp: String(payload.whatsapp ?? "").trim() || null,
    state,
    lga_city: lgaCity,
    general_location: String(payload.generalLocation ?? "").trim() || null,
    private_address: String(payload.privateAddress ?? "").trim() || null,
    is_public_location: sourceType === "church",
  });
  if (sourceError) {
    await supabase.auth.admin.deleteUser(profileId);
    return res.status(500).json({ error: sourceError.message });
  }
  return res.status(201).json({ ok: true });
}
