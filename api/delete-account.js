import { createClient } from "@supabase/supabase-js";

function send(res, status, body) {
  res.status(status).json(body);
}

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function removeCertificateFiles(supabase, certificates) {
  const paths = certificates
    .map((certificate) => certificate.storage_path)
    .filter(Boolean);
  if (paths.length) {
    throwIfError(await supabase.storage.from("certificate-pdfs").remove(paths));
  }
}

async function removeEnrolments(supabase, filters) {
  for (const [column, value] of filters) {
    if (value) {
      throwIfError(
        await supabase.from("recruitment_enrolments").delete().eq(column, value),
      );
    }
  }
}

async function deleteVolunteerRegistrations(supabase, profileId, registrationId) {
  let query = supabase
    .from("volunteer_registrations")
    .select("id,enrolment_id");
  query = profileId
    ? query.eq("profile_id", profileId)
    : query.eq("id", registrationId);
  const registrations = throwIfError(await query);
  const enrolmentIds = registrations
    .map((registration) => registration.enrolment_id)
    .filter(Boolean);

  if (registrations.length) {
    throwIfError(
      await supabase
        .from("volunteer_registrations")
        .delete()
        .in("id", registrations.map((registration) => registration.id)),
    );
  }
  if (enrolmentIds.length) {
    throwIfError(
      await supabase.from("recruitment_enrolments").delete().in("id", enrolmentIds),
    );
  }
}

async function deleteStudent(supabase, studentId) {
  const student = throwIfError(
    await supabase
      .from("students")
      .select("id,profile_id")
      .eq("id", studentId)
      .single(),
  );
  if (!student) throw new Error("Student account not found.");

  const certificates = throwIfError(
    await supabase
      .from("certificates")
      .select("id,storage_path")
      .eq("student_id", student.id),
  );
  await removeCertificateFiles(supabase, certificates);
  throwIfError(
    await supabase.from("certificates").delete().eq("student_id", student.id),
  );
  await removeEnrolments(supabase, [["student_id", student.id]]);
  throwIfError(await supabase.from("students").delete().eq("id", student.id));
  return student.profile_id;
}

async function deleteInstructor(supabase, instructorId) {
  const instructor = throwIfError(
    await supabase
      .from("instructors")
      .select("id,profile_id")
      .eq("id", instructorId)
      .single(),
  );
  if (!instructor) throw new Error("Instructor account not found.");

  await deleteVolunteerRegistrations(supabase, instructor.profile_id, null);
  await removeEnrolments(supabase, [["instructor_id", instructor.id]]);
  throwIfError(
    await supabase.from("instructors").delete().eq("id", instructor.id),
  );
  return instructor.profile_id;
}

async function deleteInstructorApplication(supabase, applicationId) {
  const application = throwIfError(
    await supabase
      .from("instructor_applications")
      .select("id,profile_id")
      .eq("id", applicationId)
      .single(),
  );
  if (!application) throw new Error("Instructor application not found.");
  await deleteVolunteerRegistrations(supabase, application.profile_id, null);
  throwIfError(
    await supabase
      .from("instructor_applications")
      .delete()
      .eq("id", application.id),
  );
  return application.profile_id;
}

async function deleteVolunteerRegistration(supabase, registrationId) {
  const registration = throwIfError(
    await supabase
      .from("volunteer_registrations")
      .select("id,profile_id,enrolment_id")
      .eq("id", registrationId)
      .single(),
  );
  if (!registration) throw new Error("Volunteer registration not found.");
  await deleteVolunteerRegistrations(
    supabase,
    registration.profile_id,
    registration.id,
  );
  return registration.profile_id;
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
    return send(res, 503, { error: "Account deletion service is not configured." });
  }
  if (!token) return send(res, 401, { error: "Administrator login required." });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Administrator login expired.");

    const adminProfile = throwIfError(
      await supabase
        .from("profiles")
        .select("id,role,status")
        .eq("id", userData.user.id)
        .single(),
    );
    if (adminProfile?.role !== "admin" || adminProfile?.status !== "active") {
      return send(res, 403, { error: "Administrator permission required." });
    }

    const target = req.body?.target ?? {};
    if (!target.id || !["student", "instructor", "instructor_application", "volunteer_registration"].includes(target.kind)) {
      return send(res, 400, { error: "Invalid account deletion request." });
    }

    let profileId;
    if (target.kind === "student") profileId = await deleteStudent(supabase, target.id);
    if (target.kind === "instructor") profileId = await deleteInstructor(supabase, target.id);
    if (target.kind === "instructor_application") profileId = await deleteInstructorApplication(supabase, target.id);
    if (target.kind === "volunteer_registration") profileId = await deleteVolunteerRegistration(supabase, target.id);

    if (profileId) {
      throwIfError(await supabase.auth.admin.deleteUser(profileId));
    }
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 400, {
      error: error?.message || "Account deletion could not be completed.",
    });
  }
}
