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

function validateForm(fields, formData) {
  for (const field of fields) {
    const value = formData[field.key];
    if (
      field.required &&
      (value === undefined ||
        value === null ||
        value === "" ||
        (field.type === "checkbox" && value !== true))
    ) {
      throw new Error(`${field.label} is required.`);
    }
  }

  const email = String(formData.email ?? "").trim().toLowerCase();
  const fullName = String(formData.full_name ?? "").trim();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required.");
  }
  if (fullName.length < 2) {
    throw new Error("Full name is required.");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return send(res, 503, { error: "Registration service is not configured." });
  }

  const { recruitmentKind, campaignSlug = "", formData = {}, website = "" } =
    req.body ?? {};
  if (website) return send(res, 200, { ok: true });
  if (!["student", "volunteer_instructor"].includes(recruitmentKind)) {
    return send(res, 400, { error: "Invalid registration type." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let createdUserId = null;

  try {
    const { data: form, error: formError } = await supabase
      .from("registration_forms")
      .select("recruitment_kind,fields,is_published")
      .eq("recruitment_kind", recruitmentKind)
      .eq("is_published", true)
      .single();
    if (formError || !form) throw new Error("This registration form is unavailable.");
    validateForm(form.fields ?? [], formData);

    let campaign = null;
    if (campaignSlug) {
      const { data, error } = await supabase
        .from("recruitment_campaigns")
        .select("id,recruitment_kind,is_active")
        .eq("slug", campaignSlug)
        .eq("is_active", true)
        .single();
      if (error || !data || data.recruitment_kind !== recruitmentKind) {
        throw new Error("This recruitment campaign is unavailable.");
      }
      campaign = data;
    }

    const fullName = String(formData.full_name).trim();
    const email = String(formData.email).trim().toLowerCase();
    const phone = String(formData.phone ?? "").trim() || null;
    const address = String(formData.address ?? "").trim() || null;

    if (recruitmentKind === "student") {
      const { data: invitation, error: invitationError } =
        await supabase.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, role: "student" },
          redirectTo: `${siteUrl()}/login/student?type=invite`,
        });
      if (invitationError) throw invitationError;
      createdUserId = invitation.user.id;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: createdUserId,
        email,
        full_name: fullName,
        phone,
        role: "student",
        status: "active",
        last_activity_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;

      const { data: student, error: studentError } = await supabase
        .from("students")
        .insert({
          profile_id: createdUserId,
          full_name: fullName,
          email,
          whatsapp: phone,
          address,
          location_name: address,
          denomination: formData.denomination || null,
          is_adventist: Boolean(formData.is_adventist),
          registration_data: formData,
        })
        .select("id")
        .single();
      if (studentError) throw studentError;

      const progressRows = Array.from({ length: 26 }, (_, index) => ({
        student_id: student.id,
        lesson_number: index + 1,
        status: "not_started",
        is_locked: index !== 0,
      }));
      const { error: progressError } = await supabase
        .from("student_lesson_progress")
        .insert(progressRows);
      if (progressError) throw progressError;

      const { error: enrolmentError } = await supabase
        .from("recruitment_enrolments")
        .insert({
          campaign_id: campaign?.id ?? null,
          recruitment_kind: recruitmentKind,
          full_name: fullName,
          email,
          phone,
          address,
          form_data: formData,
          student_id: student.id,
        });
      if (enrolmentError) throw enrolmentError;

      return send(res, 201, {
        ok: true,
        message: "Registration received. Check your email to create your password.",
      });
    }

    const { data: enrolment, error: enrolmentError } = await supabase
      .from("recruitment_enrolments")
      .insert({
        campaign_id: campaign?.id ?? null,
        recruitment_kind: recruitmentKind,
        full_name: fullName,
        email,
        phone,
        address,
        form_data: formData,
      })
      .select("id")
      .single();
    if (enrolmentError) throw enrolmentError;

    const { error: volunteerError } = await supabase
      .from("volunteer_registrations")
      .insert({
        campaign_id: campaign?.id ?? null,
        enrolment_id: enrolment.id,
        full_name: fullName,
        email,
        phone,
        address,
        form_data: formData,
      });
    if (volunteerError) throw volunteerError;

    return send(res, 201, {
      ok: true,
      message:
        "Registration received. Login access will be emailed after administrator approval.",
    });
  } catch (error) {
    if (createdUserId) {
      await supabase.auth.admin.deleteUser(createdUserId);
    }
    const message = error?.message || "Registration could not be completed.";
    const status = /already|duplicate/i.test(message) ? 409 : 400;
    return send(res, status, { error: message });
  }
}
