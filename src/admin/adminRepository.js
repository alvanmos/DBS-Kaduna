import { supabase } from "../lib/supabase.js";

const emptyData = {
  students: [],
  instructors: [],
  lessons: [],
  questions: [],
  certificates: [],
  news: [],
};

const milestoneLabels = {
  studying: "Studying",
  awaiting_baptism: "Awaiting Baptism",
  baptized: "Baptized",
  awaiting_graduation: "Awaiting Graduation",
  graduated: "Graduated",
};

const questionTypeLabels = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  short_answer: "Short answer",
  essay: "Essay",
};

const questionTypeValues = Object.fromEntries(
  Object.entries(questionTypeLabels).map(([value, label]) => [label, value]),
);

function capitalize(value) {
  if (!value) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function dateOnly(value) {
  return value ? value.slice(0, 10) : "";
}

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data ?? [];
}

function safeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}

export async function loadAdminData() {
  const [
    profiles,
    applications,
    instructors,
    students,
    lessons,
    questions,
    progress,
    submissions,
    graduationRequests,
    certificates,
    news,
  ] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("instructor_applications").select("*"),
    supabase.from("instructors").select("*"),
    supabase.from("students").select("*"),
    supabase.from("lessons").select("*").order("number"),
    supabase
      .from("questions")
      .select("*")
      .order("lesson_number")
      .order("sort_order"),
    supabase.from("student_lesson_progress").select("*"),
    supabase
      .from("submissions")
      .select("student_id, marker_instructor_id, status"),
    supabase
      .from("graduation_requests")
      .select("student_id, requested_by_instructor_id, status"),
    supabase.from("certificates").select("*").order("issued_at", {
      ascending: false,
    }),
    supabase.from("news").select("*").order("created_at", {
      ascending: false,
    }),
  ]).then((results) => results.map(throwIfError));

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const instructorNames = new Map();

  const mappedInstructors = instructors.map((instructor) => {
    const profile = profilesById.get(instructor.profile_id);
    const name = profile?.full_name || profile?.email || "Instructor";
    instructorNames.set(instructor.id, name);
    return {
      id: instructor.id,
      profileId: instructor.profile_id,
      name,
      email: profile?.email ?? "",
      whatsapp: instructor.whatsapp,
      status: capitalize(instructor.status),
      approval: "Approved",
      maxLoad: instructor.max_student_load,
      unmarked: submissions.filter(
        (submission) =>
          submission.marker_instructor_id === instructor.id &&
          submission.status === "submitted",
      ).length,
      graduationRequests: graduationRequests.filter(
        (request) =>
          request.requested_by_instructor_id === instructor.id &&
          request.status === "pending",
      ).length,
    };
  });

  const pendingApplications = applications
    .filter((application) => application.status === "pending")
    .map((application) => {
      const profile = profilesById.get(application.profile_id);
      return {
        id: `application-${application.id}`,
        applicationId: application.id,
        profileId: application.profile_id,
        name: profile?.full_name || profile?.email || "Volunteer applicant",
        email: profile?.email ?? "",
        whatsapp: application.whatsapp,
        status: "Pending",
        approval: "Awaiting Approval",
        maxLoad: 10,
        unmarked: 0,
        graduationRequests: 0,
      };
    });

  const mappedStudents = students.map((student) => {
    const studentProgress = progress.filter(
      (item) => item.student_id === student.id,
    );
    const completedLessons = studentProgress.filter(
      (item) => item.status === "completed",
    ).length;
    const currentLesson = Math.max(
      1,
      ...studentProgress.map((item) => item.lesson_number),
    );
    return {
      id: student.id,
      serial: student.serial_number,
      name: student.full_name,
      denomination: student.denomination || "Not provided",
      status: capitalize(student.status),
      milestone: milestoneLabels[student.milestone] ?? "Studying",
      instructorId: student.instructor_id,
      progress: Math.round((completedLessons / 26) * 100),
      currentLesson,
      joined: dateOnly(student.enrolled_at),
      location: {
        city: student.location_name || "Kaduna",
        lat: Number(student.latitude ?? 10.5105),
        lng: Number(student.longitude ?? 7.4165),
      },
    };
  });

  const mappedLessons = lessons.map((lesson) => ({
    id: `lesson-${String(lesson.number).padStart(2, "0")}`,
    number: lesson.number,
    title: lesson.title,
    status: lesson.file_status === "uploaded" ? "Uploaded" : "Not uploaded",
    fileName: lesson.original_file_name ?? "",
    uploadedAt: dateOnly(lesson.uploaded_at),
  }));

  const mappedQuestions = questions.map((question) => ({
    id: question.id,
    lesson: question.lesson_number,
    order: question.sort_order,
    type: questionTypeLabels[question.kind] ?? capitalize(question.kind),
    marker: question.marker_instructor_id
      ? instructorNames.get(question.marker_instructor_id) ?? "Instructor"
      : "Auto-mark",
    markerId: question.marker_instructor_id,
    prompt: question.prompt,
  }));

  const mappedCertificates = certificates.map((certificate) => ({
    id: certificate.id,
    studentId: certificate.student_id,
    code: certificate.verification_code,
    issuedAt: dateOnly(certificate.issued_at),
    status: certificate.revoked_at ? "Revoked" : "Verified",
  }));

  const mappedNews = news.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    mediaType: capitalize(item.media_type),
    mediaName: item.media_storage_path?.split("/").pop() ?? "",
    mediaPath: item.media_storage_path,
    status: item.is_published ? "Published" : "Draft",
    publishedAt: dateOnly(item.published_at ?? item.created_at),
  }));

  return {
    students: mappedStudents,
    instructors: [...mappedInstructors, ...pendingApplications],
    lessons: mappedLessons,
    questions: mappedQuestions,
    certificates: mappedCertificates,
    news: mappedNews,
  };
}

export function getEmptyAdminData() {
  return structuredClone(emptyData);
}

export async function assignStudentInstructor(studentId, instructorId) {
  throwIfError(
    await supabase
      .from("students")
      .update({ instructor_id: instructorId || null })
      .eq("id", studentId),
  );
}

export async function approveInstructor(applicationId, maxLoad) {
  throwIfError(
    await supabase.rpc("admin_approve_instructor_application", {
      application_id: applicationId,
      student_limit: maxLoad,
    }),
  );
}

export async function updateInstructor(instructorId, changes) {
  const databaseChanges = {};
  if (changes.maxLoad !== undefined) {
    databaseChanges.max_student_load = changes.maxLoad;
  }
  if (changes.status) {
    databaseChanges.status = changes.status.toLowerCase();
  }
  throwIfError(
    await supabase
      .from("instructors")
      .update(databaseChanges)
      .eq("id", instructorId),
  );
}

export async function uploadLessonPdf(lessonNumber, file) {
  const storagePath = `lesson-${String(lessonNumber).padStart(2, "0")}.pdf`;
  throwIfError(
    await supabase.storage.from("lesson-pdfs").upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: true,
    }),
  );
  throwIfError(
    await supabase
      .from("lessons")
      .update({
        file_status: "uploaded",
        storage_path: storagePath,
        original_file_name: file.name,
        uploaded_at: new Date().toISOString(),
      })
      .eq("number", lessonNumber),
  );
}

export async function addQuestion({
  lesson,
  type,
  markerId,
  prompt,
  order,
}) {
  throwIfError(
    await supabase.from("questions").insert({
      lesson_number: Number(lesson),
      kind: questionTypeValues[type],
      prompt,
      marker_instructor_id: markerId || null,
      sort_order: order,
    }),
  );
}

export async function updateQuestionType(questionId, type) {
  const kind = questionTypeValues[type];
  if (!kind) {
    throw new Error("Choose a valid question type.");
  }

  throwIfError(
    await supabase.from("questions").update({ kind }).eq("id", questionId),
  );
}

export async function moveQuestion(questionId, direction) {
  throwIfError(
    await supabase.rpc("admin_move_question", {
      question_id: questionId,
      direction,
    }),
  );
}

export async function deleteQuestion(questionId) {
  throwIfError(
    await supabase.from("questions").delete().eq("id", questionId),
  );
}

export async function issueCertificate(studentId) {
  return throwIfError(
    await supabase.rpc("admin_issue_certificate", {
      input_student_id: studentId,
    }),
  );
}

export async function publishNews({ title, body, mediaType, mediaFile }) {
  let mediaStoragePath = null;
  if (mediaFile) {
    mediaStoragePath = `news/${crypto.randomUUID()}-${safeFileName(
      mediaFile.name,
    )}`;
    throwIfError(
      await supabase.storage
        .from("news-media")
        .upload(mediaStoragePath, mediaFile, {
          contentType: mediaFile.type,
          upsert: false,
        }),
    );
  }

  try {
    throwIfError(
      await supabase.from("news").insert({
        title,
        body,
        media_type: mediaType.toLowerCase(),
        media_storage_path: mediaStoragePath,
        is_published: true,
        published_at: new Date().toISOString(),
      }),
    );
  } catch (error) {
    if (mediaStoragePath) {
      await supabase.storage.from("news-media").remove([mediaStoragePath]);
    }
    throw error;
  }
}

export async function deleteNews(newsItem) {
  throwIfError(await supabase.from("news").delete().eq("id", newsItem.id));
  if (newsItem.mediaPath) {
    throwIfError(
      await supabase.storage.from("news-media").remove([newsItem.mediaPath]),
    );
  }
}
