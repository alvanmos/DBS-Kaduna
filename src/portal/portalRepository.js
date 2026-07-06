import { supabase } from "../lib/supabase.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

function isMissingSchemaObject(error, names = []) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST205" ||
    error?.message?.includes("schema cache") ||
    names.some((name) => error?.message?.includes(name))
  );
}

function isMissingMessagingSchema(error) {
  return isMissingSchemaObject(error, [
    "portal_messages",
    "student_send_message",
    "instructor_send_student_message",
    "instructor_send_admin_message",
    "admin_send_instructor_message",
  ]);
}

function isMissingDeleteSchema(error) {
  return isMissingSchemaObject(error, ["student_delete_my_account_data"]);
}

function throwIfDeleteUnavailable(result) {
  if (result.error && isMissingDeleteSchema(result.error)) {
    throw new Error(
      "Data deletion is being updated. Please try again shortly or contact DBS Kaduna support.",
    );
  }
  return throwIfError(result);
}

function throwIfMessagingUnavailable(result) {
  if (result.error && isMissingMessagingSchema(result.error)) {
    throw new Error(
      "Messaging is being updated. Please try again shortly or contact DBS Kaduna support.",
    );
  }
  return throwIfError(result);
}

async function loadPortalMessages(query) {
  const result = await query;
  if (result.error && isMissingMessagingSchema(result.error)) {
    return [];
  }
  return throwIfError(result);
}

export async function touchActivity() {
  if (!supabase) return;
  await supabase.rpc("touch_my_activity");
}

function fallbackFileName(storagePath, defaultName = "download.pdf") {
  return storagePath?.split("/").pop() || defaultName;
}

async function createSignedStorageUrl(bucket, storagePath) {
  if (!storagePath) throw new Error("This PDF is not available yet.");
  const result = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 15 * 60);
  const data = throwIfError(result);
  return data.signedUrl;
}

async function downloadBucketFile(bucket, storagePath, fileName) {
  if (!storagePath) throw new Error("This PDF is not available yet.");
  const result = await supabase.storage.from(bucket).download(storagePath);
  const blob = throwIfError(result);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || fallbackFileName(storagePath);
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function resolveLoginIdentifier(role, identifier) {
  const response = await fetch("/api/login-identity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, identifier }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Login details could not be verified.");
  }
  return payload.email;
}

export async function loadStudentDashboard() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Student login required.");

  const [profileResult, studentResult, lessonsResult, questionsResult, formResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("students").select("*").eq("profile_id", user.id).single(),
      supabase.from("lessons").select("*").order("number"),
      supabase
        .from("questions")
        .select("*")
        .eq("is_published", true)
        .order("lesson_number")
        .order("sort_order"),
      supabase
        .from("registration_forms")
        .select("fields")
        .eq("recruitment_kind", "student")
        .eq("is_published", true)
        .maybeSingle(),
    ]);
  const profile = throwIfError(profileResult);
  const student = throwIfError(studentResult);
  const lessons = throwIfError(lessonsResult);
  const questions = throwIfError(questionsResult);
  const registrationForm = throwIfError(formResult);

  const [progress, submissions, certificates, messages] = await Promise.all([
    supabase
      .from("student_lesson_progress")
      .select("*")
      .eq("student_id", student.id)
      .order("lesson_number")
      .then(throwIfError),
    supabase
      .from("submissions")
      .select("*")
      .eq("student_id", student.id)
      .then(throwIfError),
    supabase
      .from("certificates")
      .select("*")
      .eq("student_id", student.id)
      .is("revoked_at", null)
      .order("issued_at", { ascending: false })
      .then(throwIfError),
    loadPortalMessages(
      supabase
      .from("portal_messages")
      .select("*")
      .eq("student_id", student.id)
      .eq("channel", "student_instructor")
      .order("created_at")
    ),
  ]);

  let instructor = null;
  if (student.instructor_id) {
    const instructorRecord = throwIfError(
      await supabase
        .from("instructors")
        .select("*")
        .eq("id", student.instructor_id)
        .single(),
    );
    const instructorProfile = throwIfError(
      await supabase
        .from("profiles")
        .select("full_name,email,phone")
        .eq("id", instructorRecord.profile_id)
        .single(),
    );
    instructor = {
      ...instructorRecord,
      name: instructorProfile.full_name,
      email: instructorProfile.email,
      phone: instructorProfile.phone || instructorRecord.whatsapp,
    };
  }

  await touchActivity();
  return {
    profile,
    student,
    instructor,
    registrationForm,
    lessons,
    questions,
    progress,
    submissions,
    certificates,
    messages,
  };
}

export async function loadInstructorDashboard() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Instructor login required.");

  const [profile, instructor, lessons, questions, admins] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single().then(throwIfError),
    supabase.from("instructors").select("*").eq("profile_id", user.id).single().then(throwIfError),
    supabase.from("lessons").select("*").order("number").then(throwIfError),
    supabase
      .from("questions")
      .select("*")
      .eq("is_published", true)
      .order("lesson_number")
      .order("sort_order")
      .then(throwIfError),
    supabase
      .from("profiles")
      .select("id,full_name,email")
      .eq("role", "admin")
      .eq("status", "active")
      .order("created_at")
      .then(throwIfError),
  ]);
  const students = throwIfError(
    await supabase
      .from("students")
      .select("*")
      .eq("instructor_id", instructor.id)
      .order("full_name"),
  );
  const studentIds = students.map((student) => student.id);
  const [progress, submissions, graduationRequests, studentMessages, adminMessages] = studentIds.length
    ? await Promise.all([
        supabase
          .from("student_lesson_progress")
          .select("*")
          .in("student_id", studentIds)
          .then(throwIfError),
        supabase
          .from("submissions")
          .select("*")
          .in("student_id", studentIds)
          .then(throwIfError),
        supabase
          .from("graduation_requests")
          .select("*")
          .in("student_id", studentIds)
          .then(throwIfError),
        loadPortalMessages(
          supabase
          .from("portal_messages")
          .select("*")
          .in("student_id", studentIds)
          .eq("channel", "student_instructor")
          .order("created_at"),
        ),
        loadPortalMessages(
          supabase
          .from("portal_messages")
          .select("*")
          .eq("instructor_id", instructor.id)
          .eq("channel", "admin_instructor")
          .order("created_at"),
        ),
      ])
    : await Promise.all([
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([]),
        loadPortalMessages(
          supabase
          .from("portal_messages")
          .select("*")
          .eq("instructor_id", instructor.id)
          .eq("channel", "admin_instructor")
          .order("created_at"),
        ),
      ]);

  await touchActivity();
  return {
    profile,
    instructor,
    admins,
    students,
    lessons,
    questions,
    progress,
    submissions,
    graduationRequests,
    studentMessages,
    adminMessages,
  };
}

export async function openLessonPdf(storagePath) {
  const signedUrl = await createSignedStorageUrl("lesson-pdfs", storagePath);
  window.open(signedUrl, "_blank", "noopener,noreferrer");
}

export async function downloadLessonPdf(storagePath, fileName) {
  await downloadBucketFile(
    "lesson-pdfs",
    storagePath,
    fileName || fallbackFileName(storagePath, "lesson.pdf"),
  );
}

export async function downloadCertificatePdf(storagePath, fileName) {
  await downloadBucketFile(
    "certificate-pdfs",
    storagePath,
    fileName || fallbackFileName(storagePath, "certificate.pdf"),
  );
}

export async function submitStudentLesson(lessonNumber, answers) {
  throwIfError(
    await supabase.rpc("student_submit_lesson", {
      input_lesson_number: lessonNumber,
      input_answers: answers,
    }),
  );
}

export async function setLessonLock(studentId, lessonNumber, isLocked) {
  throwIfError(
    await supabase.rpc("instructor_set_lesson_lock", {
      input_student_id: studentId,
      input_lesson_number: lessonNumber,
      input_locked: isLocked,
    }),
  );
}

export async function reviewSubmission(submissionId, score, feedback, status) {
  throwIfError(
    await supabase.rpc("instructor_review_submission", {
      input_submission_id: submissionId,
      input_score: score === "" ? null : Number(score),
      input_feedback: feedback,
      input_status: status,
    }),
  );
}

export async function setLessonResult(studentId, lessonNumber, result) {
  throwIfError(
    await supabase.rpc("instructor_set_lesson_result", {
      input_student_id: studentId,
      input_lesson_number: lessonNumber,
      input_result: result,
    }),
  );
}

export async function requestGraduation(studentId, instructorId) {
  throwIfError(
    await supabase.from("graduation_requests").insert({
      student_id: studentId,
      requested_by_instructor_id: instructorId,
      notes: "All 26 lessons completed. Please approve graduation and certificate access.",
    }),
  );
}

export async function updateStudentData(formData) {
  return throwIfError(
    await supabase.rpc("student_update_my_data", {
      input_payload: formData,
    }),
  );
}

export async function deleteStudentData() {
  return throwIfDeleteUnavailable(
    await supabase.rpc("student_delete_my_account_data"),
  );
}

export async function sendStudentMessage(body) {
  return throwIfMessagingUnavailable(
    await supabase.rpc("student_send_message", {
      input_body: body,
    }),
  );
}

export async function sendInstructorMessageToStudent(studentId, body) {
  return throwIfMessagingUnavailable(
    await supabase.rpc("instructor_send_student_message", {
      input_student_id: studentId,
      input_body: body,
    }),
  );
}

export async function sendInstructorMessageToAdmin(body) {
  return throwIfMessagingUnavailable(
    await supabase.rpc("instructor_send_admin_message", {
      input_body: body,
    }),
  );
}
