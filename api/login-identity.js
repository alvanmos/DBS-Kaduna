import { createClient } from "@supabase/supabase-js";

function send(res, status, body) {
  res.status(status).json(body);
}

function normalizeIdentifier(value) {
  return String(value ?? "").trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return send(res, 503, { error: "Login lookup service is not configured." });
  }

  const role = String(req.body?.role ?? "").trim().toLowerCase();
  const identifier = normalizeIdentifier(req.body?.identifier);
  if (!["student", "instructor", "admin"].includes(role) || !identifier) {
    return send(res, 400, { error: "A valid role and username or email is required." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (role === "admin") {
      const password = String(req.body?.password ?? "");
      if (identifier !== "allthingsnew" || password !== "onevoice27") {
        return send(res, 404, { error: "Username or password is incorrect." });
      }

      const adminEmail = "onevoice27-admin@dbskaduna.org";
      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email")
        .eq("email", adminEmail)
        .maybeSingle();
      if (profileError) throw profileError;

      let adminId = existingProfile?.id;
      if (!adminId) {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email: adminEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: "OneVoice27 Administrator" },
        });
        if (createError) throw createError;
        adminId = created.user.id;
      } else {
        const { error: passwordError } = await supabase.auth.admin.updateUserById(adminId, { password });
        if (passwordError) throw passwordError;
      }

      const { error: roleError } = await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("id", adminId);
      if (roleError) throw roleError;

      return send(res, 200, { ok: true, email: adminEmail });
    }

    const query = supabase
      .from("profiles")
      .select("email, role, status")
      .eq("role", role)
      .limit(1);

    const { data: profile, error } = identifier.includes("@")
      ? await query.eq("email", identifier).maybeSingle()
      : await query.eq("username", identifier).maybeSingle();

    if (error || !profile?.email) {
      return send(res, 404, { error: "Username or password is incorrect." });
    }

    if (profile.status !== "active") {
      return send(res, 403, {
        error:
          role === "instructor"
            ? "This instructor account is awaiting administrator approval."
            : role === "admin"
              ? "This administrator account is not active."
              : "This student account is not active yet.",
      });
    }

    return send(res, 200, { ok: true, email: profile.email });
  } catch (error) {
    return send(res, 400, {
      error: error?.message || "Login details could not be verified.",
    });
  }
}
