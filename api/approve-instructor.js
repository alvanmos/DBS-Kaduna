import { createClient } from "@supabase/supabase-js";

function send(res, status, body) {
  res.status(status).json(body);
}

function siteUrl() {
  const configured = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;
  return "http://localhost:5173";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !serviceRoleKey) {
    return send(res, 503, { error: "Approval service is not configured." });
  }
  if (!token) return send(res, 401, { error: "Administrator login required." });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let createdUserId = null;

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Administrator login expired.");

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id,role,status")
      .eq("id", userData.user.id)
      .single();
    if (adminProfile?.role !== "admin" || adminProfile?.status !== "active") {
      return send(res, 403, { error: "Administrator permission required." });
    }

    const { registrationId, maxLoad = 10 } = req.body ?? {};
    const { data: registration, error: registrationError } = await supabase
      .from("volunteer_registrations")
      .select("*")
      .eq("id", registrationId)
      .eq("status", "pending")
      .single();
    if (registrationError || !registration) {
      throw new Error("Pending volunteer registration not found.");
    }

    let profileId = registration.profile_id;
    let approvalMessage =
      "Instructor approved. The registered username and password are now active.";

    if (profileId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", profileId)
        .single();
      if (profileError || !profile) {
        throw new Error("The pending instructor profile could not be found.");
      }

      const { error: activateProfileError } = await supabase
        .from("profiles")
        .update({
          email: registration.email,
          full_name: registration.full_name,
          phone: registration.phone,
          role: "instructor",
          status: "active",
        })
        .eq("id", profileId);
      if (activateProfileError) throw activateProfileError;
    } else {
      const { data: invitation, error: invitationError } =
        await supabase.auth.admin.inviteUserByEmail(registration.email, {
          data: { full_name: registration.full_name, role: "instructor" },
          redirectTo: `${siteUrl()}/login/instructor?type=invite`,
        });
      if (invitationError) throw invitationError;
      createdUserId = invitation.user.id;
      profileId = createdUserId;
      approvalMessage =
        "Instructor approved and password-setup invitation sent by email.";

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: createdUserId,
        email: registration.email,
        full_name: registration.full_name,
        phone: registration.phone,
        role: "instructor",
        status: "active",
        last_activity_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;
    }

    const { data: instructor, error: instructorError } = await supabase
      .from("instructors")
      .insert({
        profile_id: profileId,
        whatsapp: registration.phone || "Not provided",
        address: registration.address,
        registration_data: registration.form_data,
        max_student_load: Math.min(100, Math.max(1, Number(maxLoad) || 10)),
      })
      .select("id")
      .single();
    if (instructorError) throw instructorError;

    const { error: updateError } = await supabase
      .from("volunteer_registrations")
      .update({
        status: "approved",
        instructor_id: instructor.id,
        reviewed_by: adminProfile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", registration.id);
    if (updateError) throw updateError;

    if (registration.enrolment_id) {
      await supabase
        .from("recruitment_enrolments")
        .update({ instructor_id: instructor.id })
        .eq("id", registration.enrolment_id);
    }

    return send(res, 200, {
      ok: true,
      instructorId: instructor.id,
      message: approvalMessage,
    });
  } catch (error) {
    if (createdUserId) await supabase.auth.admin.deleteUser(createdUserId);
    const message = error?.message || "Approval could not be completed.";
    return send(res, 400, { error: message });
  }
}
