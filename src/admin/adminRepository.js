import { supabase } from "../lib/supabase.js";

const emptyData = {
  students: [],
  instructors: [],
  lessons: [],
  questions: [],
  certificates: [],
  recruitmentCampaigns: [],
  recruitmentEnrolments: [],
  registrationForms: [],
  news: [],
  instructorMessages: [],
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

const protectedFieldDefinitions = {
  full_name: {
    key: "full_name",
    label: "Full name",
    type: "text",
    required: true,
    system: true,
  },
  email: {
    key: "email",
    label: "Email address",
    type: "email",
    required: true,
    system: true,
  },
  username: {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    system: true,
  },
  password: {
    key: "password",
    label: "Password",
    type: "password",
    required: true,
    system: true,
  },
  privacy_consent: {
    key: "privacy_consent",
    label:
      "I consent to DBS Kaduna using my details for registration, course administration, and instructor support in line with the Privacy Notice.",
    type: "checkbox",
    required: true,
    system: true,
  },
};

function capitalize(value) {
  if (!value) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function dateOnly(value) {
  return value ? value.slice(0, 10) : "";
}

function currentLessonNumber(progress) {
  if (progress.length === 0) return 1;

  const nextLesson = progress
    .filter((item) => item.status !== "completed")
    .sort((first, second) => first.lesson_number - second.lesson_number)[0];

  return nextLesson?.lesson_number ?? 26;
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

function isMissingRecruitmentSchema(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    error?.message?.includes("recruitment_campaigns") ||
    error?.message?.includes("recruitment_enrolments") ||
    error?.message?.includes("registration_forms") ||
    error?.message?.includes("volunteer_registrations")
  );
}

function isMissingMessagingSchema(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST205" ||
    error?.message?.includes("portal_messages") ||
    error?.message?.includes("schema cache")
  );
}

function throwIfMessagingUnavailable(result) {
  if (result.error && isMissingMessagingSchema(result.error)) {
    throw new Error(
      "Messaging is being updated. Please try again shortly or contact DBS Kaduna support.",
    );
  }
  return throwIfError(result);
}

async function loadRecruitmentData() {
  const [campaignResult, enrolmentResult, formResult, volunteerResult] =
    await Promise.all([
    supabase
      .from("recruitment_campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("recruitment_enrolments")
      .select("*")
      .order("submitted_at", { ascending: false }),
    supabase.from("registration_forms").select("*").order("recruitment_kind"),
    supabase
      .from("volunteer_registrations")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const schemaError =
    campaignResult.error ||
    enrolmentResult.error ||
    formResult.error ||
    volunteerResult.error;
  if (schemaError && isMissingRecruitmentSchema(schemaError)) {
    return [[], [], [], []];
  }
  return [
    throwIfError(campaignResult),
    throwIfError(enrolmentResult),
    throwIfError(formResult),
    throwIfError(volunteerResult),
  ];
}

function accountActivityStatus(profile, storedStatus) {
  if (storedStatus === "inactive") return "Inactive";
  const lastActivity = new Date(profile?.last_activity_at ?? 0).getTime();
  return Date.now() - lastActivity >= 30 * 24 * 60 * 60 * 1000
    ? "Inactive"
    : "Active";
}

export async function loadAdminData() {
  const recruitmentDataPromise = loadRecruitmentData();
  const results = await Promise.all([
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
    supabase
      .from("portal_messages")
      .select("*")
      .eq("channel", "admin_instructor")
      .order("created_at"),
  ]);

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
    instructorMessages,
  ] = results.map((result, index) => {
    if (index === 11 && result.error && isMissingMessagingSchema(result.error)) {
      return [];
    }
    return throwIfError(result);
  });
  const [
    recruitmentCampaigns,
    recruitmentEnrolments,
    registrationForms,
    volunteerRegistrations,
  ] = await recruitmentDataPromise;

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
      username: profile?.username ?? "",
      email: profile?.email ?? "",
      whatsapp: instructor.whatsapp,
      address: instructor.address || "",
      formData: instructor.registration_data ?? {},
      status: accountActivityStatus(profile, instructor.status),
      lastActivity: dateOnly(profile?.last_activity_at),
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

  const pendingVolunteerRegistrations = volunteerRegistrations
    .filter((registration) => registration.status === "pending")
    .map((registration) => ({
      id: `registration-${registration.id}`,
      registrationId: registration.id,
      applicationId: null,
      profileId: null,
      name: registration.full_name,
      username: registration.form_data?.username ?? "",
      email: registration.email,
      whatsapp: registration.phone || "Not provided",
      address: registration.address || "Not provided",
      formData: registration.form_data ?? {},
      status: "Pending",
      approval: "Awaiting Approval",
      maxLoad: 10,
      unmarked: 0,
      graduationRequests: 0,
      lastActivity: "",
    }));

  const mappedStudents = students.map((student) => {
    const studentProgress = progress.filter(
      (item) => item.student_id === student.id,
    );
    const completedLessons = studentProgress.filter(
      (item) => item.status === "completed",
    ).length;
    const currentLesson = currentLessonNumber(studentProgress);
    return {
      id: student.id,
      serial: student.serial_number,
      name: student.full_name,
      username: profilesById.get(student.profile_id)?.username ?? "",
      denomination: student.denomination || "Not provided",
      email: student.email ?? "",
      phone: student.whatsapp ?? "",
      address: student.address || student.location_name || "Not provided",
      registrationData: student.registration_data ?? {},
      status: accountActivityStatus(
        profilesById.get(student.profile_id),
        student.status,
      ),
      lastActivity: dateOnly(
        profilesById.get(student.profile_id)?.last_activity_at,
      ),
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
    storagePath: certificate.storage_path,
    fileName: certificate.original_file_name ?? "",
  }));

  const mappedRecruitmentEnrolments = recruitmentEnrolments.map((item) => ({
    id: item.id,
    campaignId: item.campaign_id,
    recruitmentKind: item.recruitment_kind,
    name: item.full_name,
    email: item.email ?? "",
    phone: item.phone,
    address: item.address,
    formData: item.form_data ?? {},
    submittedAt: dateOnly(item.submitted_at),
  }));

  const mappedRecruitmentCampaigns = recruitmentCampaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    recruitmentKind: campaign.recruitment_kind,
    slug: campaign.slug,
    status: campaign.is_active ? "Active" : "Inactive",
    createdAt: dateOnly(campaign.created_at),
    enrolmentCount: mappedRecruitmentEnrolments.filter(
      (item) => item.campaignId === campaign.id,
    ).length,
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

  const mappedRegistrationForms = registrationForms.map((form) => ({
    id: form.id,
    recruitmentKind: form.recruitment_kind,
    title: form.title,
    description: form.description,
    fields: form.fields ?? [],
    isPublished: form.is_published,
    updatedAt: dateOnly(form.updated_at),
  }));

  return {
    students: mappedStudents,
    instructors: [
      ...mappedInstructors,
      ...pendingApplications,
      ...pendingVolunteerRegistrations,
    ],
    lessons: mappedLessons,
    questions: mappedQuestions,
    certificates: mappedCertificates,
    recruitmentCampaigns: mappedRecruitmentCampaigns,
    recruitmentEnrolments: mappedRecruitmentEnrolments,
    registrationForms: mappedRegistrationForms,
    news: mappedNews,
    instructorMessages,
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

export async function approveInstructor(instructor, maxLoad) {
  if (instructor.registrationId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch("/api/approve-instructor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        registrationId: instructor.registrationId,
        maxLoad,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Approval failed.");
    return payload;
  }

  throwIfError(
    await supabase.rpc("admin_approve_instructor_application", {
      application_id: instructor.applicationId,
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

export async function deleteAccountAsAdmin(target) {
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch("/api/delete-account", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ target }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "The account could not be deleted.");
  }
  return payload;
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
        is_published: true,
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
      is_published: true,
    }),
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
  const existingCertificates = throwIfError(
    await supabase
      .from("certificates")
      .select("*")
      .eq("student_id", studentId)
      .is("revoked_at", null)
      .order("issued_at", { ascending: false })
      .limit(1),
  );
  if (existingCertificates[0]) return existingCertificates[0];

  return throwIfError(
    await supabase.rpc("admin_issue_certificate", {
      input_student_id: studentId,
    }),
  );
}

export async function uploadCertificatePdf(studentId, file) {
  const certificate = await issueCertificate(studentId);
  const storagePath = `${studentId}/${certificate.id}-${safeFileName(file.name)}`;

  throwIfError(
    await supabase.storage.from("certificate-pdfs").upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: true,
    }),
  );

  throwIfError(
    await supabase
      .from("certificates")
      .update({
        storage_path: storagePath,
        original_file_name: file.name,
      })
      .eq("id", certificate.id),
  );

  return certificate;
}

function recruitmentCampaignSlug(name) {
  const readable = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `${readable || "campaign"}-${suffix}`;
}

export async function createRecruitmentCampaign({ name, recruitmentKind }) {
  const result = await supabase
    .from("recruitment_campaigns")
    .insert({
      name,
      recruitment_kind: recruitmentKind,
      slug: recruitmentCampaignSlug(name),
    })
    .select("*")
    .single();
  return throwIfError(result);
}

export async function deleteRecruitmentCampaign(campaignId) {
  throwIfError(
    await supabase.from("recruitment_campaigns").delete().eq("id", campaignId),
  );
}

export async function saveRegistrationForm(form) {
  const protectedKeys = Object.keys(protectedFieldDefinitions);
  const fieldsByKey = new Map(
    form.fields.map((field) => [
      field.key,
      {
        ...field,
        options: Array.isArray(field.options) ? field.options : [],
      },
    ]),
  );
  const fields = [
    ...protectedKeys.map((key) => ({
      ...(fieldsByKey.get(key) ?? protectedFieldDefinitions[key]),
      ...protectedFieldDefinitions[key],
    })),
    ...form.fields
      .filter((field) => !protectedKeys.includes(field.key))
      .map((field) => ({
        ...field,
        required: Boolean(field.required),
        options: Array.isArray(field.options) ? field.options : [],
      })),
  ];

  return throwIfError(
    await supabase
      .from("registration_forms")
      .update({
        title: form.title.trim(),
        description: form.description.trim(),
        fields,
        is_published: form.isPublished,
      })
      .eq("id", form.id)
      .select("*")
      .single(),
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

export async function clearRegistrationData() {
  return throwIfError(await supabase.rpc("admin_clear_registration_data"));
}

export async function sendAdminMessageToInstructor(instructorId, body) {
  return throwIfMessagingUnavailable(
    await supabase.rpc("admin_send_instructor_message", {
      input_instructor_id: instructorId,
      input_body: body,
    }),
  );
}
