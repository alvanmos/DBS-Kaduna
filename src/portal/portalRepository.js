import { supabase } from "../lib/supabase.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function touchActivity() {
  if (!supabase) return;
  await supabase.rpc("touch_my_activity");
}

export async function loadStudentDashboard() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Student login required.");

  const [profileResult, studentResult, lessonsResult, questionsResult] =
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
    ]);
  const profile = throwIfError(profileResult);
  const student = throwIfError(studentResult);
  const lessons = throwIfError(lessonsResult);
  const questions = throwIfError(questionsResult);

  const [progress, submissions, certificates] = await Promise.all([
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
    lessons,
    questions,
    progress,
    submissions,
    certificates,
  };
}

export async function loadInstructorDashboard() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Instructor login required.");

  const [profile, instructor, lessons, questions] = await Promise.all([
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
  ]);
  const students = throwIfError(
    await supabase
      .from("students")
      .select("*")
      .eq("instructor_id", instructor.id)
      .order("full_name"),
  );
  const studentIds = students.map((student) => student.id);
  const [progress, submissions, graduationRequests] = studentIds.length
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
      ])
    : [[], [], []];

  await touchActivity();
  return {
    profile,
    instructor,
    students,
    lessons,
    questions,
    progress,
    submissions,
    graduationRequests,
  };
}

export async function openLessonPdf(storagePath) {
  if (!storagePath) throw new Error("This lesson PDF has not been uploaded.");
  const result = await supabase.storage
    .from("lesson-pdfs")
    .createSignedUrl(storagePath, 15 * 60);
  const data = throwIfError(result);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
