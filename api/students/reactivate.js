import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function appUrl(req) {
  return String(
    process.env.DISCOVER_BIBLE_SCHOOL_APP_URL ||
      `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`,
  ).replace(/\/$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const destination = `${appUrl(req)}/login/student?reactivated=invalid`;
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.redirect(302, destination);

  const { data, error } = await serviceClient().rpc("reactivate_student_account", {
    input_token: token,
  });
  if (error) return res.redirect(302, destination);
  return res.redirect(302, `${appUrl(req)}/login/student?reactivated=${data ? "1" : "invalid"}`);
}
