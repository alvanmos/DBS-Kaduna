import { authenticated, instructorForProfile, json, method, rateLimit, createOAuthState, zoomAuthorizeUrl, audit } from "../_zoom.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "DELETE"]) || !rateLimit(req, res, "zoom-account", 20)) return;
  try {
    const { supabase, profile } = await authenticated(req, ["instructor"]);
    const instructor = await instructorForProfile(supabase, profile.id);
    if (req.method === "POST") return json(res, 200, { authorizeUrl: zoomAuthorizeUrl(createOAuthState(profile.id)) });
    if (req.method === "DELETE") {
      const { error } = await supabase.from("zoom_accounts").update({ connection_status: "disconnected", access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null, disconnected_at: new Date().toISOString() }).eq("instructor_id", instructor.id);
      if (error) throw error;
      await audit(supabase, profile.id, "zoom_account_disconnected", "zoom_account", instructor.id);
      return json(res, 200, { ok: true });
    }
    const { data, error } = await supabase.from("zoom_accounts").select("id,zoom_account_id,zoom_email,connection_status,connected_at,connection_error").eq("instructor_id", instructor.id).maybeSingle();
    if (error) throw error;
    return json(res, 200, { account: data || null });
  } catch (error) { return json(res, /permission|Authentication|active instructor/i.test(error.message) ? 403 : 500, { error: error.message || "Zoom account operation failed." }); }
}
