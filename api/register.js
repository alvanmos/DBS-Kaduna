import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const WELCOME_LETTER_FILE = "dbs-kaduna-welcome-letter.pdf";
const WELCOME_LETTER_ATTACHMENT_NAME = "DBS_Kaduna_Welcome_Letter.pdf";

function send(res, status, body) {
  res.status(status).json(body);
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^[._-]+|[._-]+$)/g, "")
    .replace(/[-._]{2,}/g, "-");
}

function sanitizeFormData(formData, username) {
  return Object.fromEntries(
    Object.entries(formData)
      .filter(([key]) => !["password", "website"].includes(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ])
      .map(([key, value]) => [key, key === "username" ? username : value]),
  );
}

function validateCredentials(username, password) {
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw new Error(
      "Choose a username with 3 to 24 letters, numbers, dots, hyphens, or underscores.",
    );
  }
  if (password.length < 8) {
    throw new Error("Choose a password with at least 8 characters.");
  }
}

function validateForm(fields, formData) {
  const consentProvided = formData.privacy_consent === true;
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

  if (!consentProvided) {
    throw new Error("You must consent to the Privacy Notice before registering.");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendWelcomeLetter({ email, fullName, studentId }) {
  const pdf = await readFile(
    join(process.cwd(), "public", WELCOME_LETTER_FILE),
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `dbs-welcome-letter-${studentId}`,
    },
    body: JSON.stringify({
      from: process.env.WELCOME_LETTER_FROM,
      to: [email],
      subject: "Welcome to Discover Bible School, Kaduna",
      html: `<p>Dear ${escapeHtml(fullName)},</p><p>Welcome to Discover Bible School, Kaduna. Your welcome letter is attached and is also available in your student dashboard.</p><p>We are glad to accompany you on your Bible study journey.</p><p>Discover Bible School, Kaduna Team</p>`,
      attachments: [
        {
          filename: WELCOME_LETTER_ATTACHMENT_NAME,
          content: pdf.toString("base64"),
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error("The welcome letter could not be sent. Please try again.");
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
  if (
    recruitmentKind === "student" &&
    (!process.env.RESEND_API_KEY || !process.env.WELCOME_LETTER_FROM)
  ) {
    return send(res, 503, {
      error: "Student welcome email service is not configured yet.",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let createdUserId = null;
  let createdStudentId = null;

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
    const username = normalizeUsername(formData.username);
    const password = String(formData.password ?? "");
    const phone = String(formData.phone ?? "").trim() || null;
    const address = String(formData.address ?? "").trim() || null;
    const sanitizedFormData = sanitizeFormData(formData, username);

    validateCredentials(username, password);

    if (recruitmentKind === "student") {
      const { data: createdUser, error: createUserError } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: "student" },
        });
      if (createUserError) throw createUserError;
      createdUserId = createdUser.user?.id;
      if (!createdUserId) throw new Error("Student account could not be created.");

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: createdUserId,
        email,
        full_name: fullName,
        phone,
        username,
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
          registration_data: sanitizedFormData,
        })
        .select("id")
        .single();
      if (studentError) throw studentError;
      createdStudentId = student.id;

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
          form_data: sanitizedFormData,
          student_id: student.id,
        });
      if (enrolmentError) throw enrolmentError;

      await sendWelcomeLetter({
        email,
        fullName,
        studentId: student.id,
      });

      return send(res, 201, {
        ok: true,
        message:
          "Registration successful. Your welcome letter has been emailed, and you can now sign in with your username and password.",
      });
    }

    const { data: createdUser, error: createUserError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "instructor" },
      });
    if (createUserError) throw createUserError;
    createdUserId = createdUser.user?.id;
    if (!createdUserId) {
      throw new Error("Volunteer instructor account could not be prepared.");
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: createdUserId,
      email,
      full_name: fullName,
      phone,
      username,
      role: "instructor",
      status: "inactive",
      last_activity_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    const { data: enrolment, error: enrolmentError } = await supabase
      .from("recruitment_enrolments")
      .insert({
        campaign_id: campaign?.id ?? null,
        recruitment_kind: recruitmentKind,
        full_name: fullName,
        email,
        phone,
        address,
        form_data: sanitizedFormData,
      })
      .select("id")
      .single();
    if (enrolmentError) throw enrolmentError;

    const { error: volunteerError } = await supabase
      .from("volunteer_registrations")
      .insert({
        campaign_id: campaign?.id ?? null,
        enrolment_id: enrolment.id,
        profile_id: createdUserId,
        full_name: fullName,
        email,
        phone,
        address,
        form_data: sanitizedFormData,
      });
    if (volunteerError) throw volunteerError;

    return send(res, 201, {
      ok: true,
      message:
        "Registration received. Your instructor login will work after administrator approval.",
    });
  } catch (error) {
    if (createdStudentId) {
      await supabase
        .from("recruitment_enrolments")
        .delete()
        .eq("student_id", createdStudentId);
      await supabase.from("students").delete().eq("id", createdStudentId);
    }
    if (createdUserId) {
      await supabase.auth.admin.deleteUser(createdUserId);
    }
    const message = error?.message || "Registration could not be completed.";
    const status = /already|duplicate/i.test(message) ? 409 : 400;
    return send(res, status, { error: message });
  }
}
