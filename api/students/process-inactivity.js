import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { data, error } = await serviceClient().rpc("process_student_inactivity", {
    input_inactivity_days: 60,
  });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ inactivated: data?.length ?? 0 });
}
