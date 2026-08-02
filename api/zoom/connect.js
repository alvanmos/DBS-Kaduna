import { authenticated, instructorForProfile, json, method, rateLimit, createOAuthState, zoomAuthorizeUrl } from "../_zoom.js";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !rateLimit(req, res, "zoom-connect", 10)) return;
  try { const { supabase, profile } = await authenticated(req, ["instructor"]); await instructorForProfile(supabase, profile.id); return json(res, 200, { authorizeUrl: zoomAuthorizeUrl(createOAuthState(profile.id)) }); }
  catch (error) { return json(res, 403, { error: error.message || "Zoom connection is unavailable." }); }
}
