import { exchangeCode, json, readOAuthState, serviceClient, encrypt, zoomFetch, audit } from "../_zoom.js";
export default async function handler(req, res) {
  const redirect = (status) => res.redirect(`${process.env.NEXT_PUBLIC_APP_URL || new URL(process.env.ZOOM_REDIRECT_URI).origin}/instructor?zoom=${status}`);
  try {
    if (req.query.error) return redirect("cancelled");
    const state = readOAuthState(req.query.state); const supabase = serviceClient();
    const { data: instructor, error: instructorError } = await supabase.from("instructors").select("id").eq("profile_id", state.profileId).eq("status", "active").single();
    if (instructorError || !instructor) throw new Error("Instructor account is no longer active.");
    const token = await exchangeCode(req.query.code); const zoomUser = await zoomFetch("/users/me", token.access_token);
    const { error } = await supabase.from("zoom_accounts").upsert({ instructor_id: instructor.id, zoom_account_id: zoomUser.account_id || zoomUser.id, zoom_user_id: zoomUser.id, zoom_email: zoomUser.email || null, access_token_encrypted: encrypt(token.access_token), refresh_token_encrypted: encrypt(token.refresh_token), token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(), connection_status: "connected", connection_error: null, connected_at: new Date().toISOString(), disconnected_at: null }, { onConflict: "instructor_id" });
    if (error) throw error; await audit(supabase, state.profileId, "zoom_account_connected", "zoom_account", instructor.id); return redirect("connected");
  } catch (error) { console.error("Zoom OAuth callback failed", error); return redirect("error"); }
}
