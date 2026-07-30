import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  BookOpenText,
  Certificate,
  CheckCircle,
  DownloadSimple,
  EnvelopeSimple,
  FilePdf,
  GraduationCap,
  LockKey,
  List,
  PaperPlaneTilt,
  PencilSimpleLine,
  Phone,
  SignOut,
  Trash,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  deleteStudentData,
  downloadCertificatePdf,
  downloadLessonPdf,
  downloadWelcomeLetter,
  loadStudentDashboard,
  openLessonPdf,
  sendStudentMessage,
  submitStudentLesson,
  updateStudentData,
} from "./portalRepository.js";
import { CommunicationHub } from "../communication/CommunicationHub.jsx";
import "../communication/communication.css";

function lessonStatus(progress, lessonNumber) {
  const item = progress.find((entry) => entry.lesson_number === lessonNumber);
  if (!item) return lessonNumber === 1 ? "available" : "locked";
  if (item.is_locked) return "locked";
  if (item.status === "not_started" || item.status === "in_progress") return "available";
  return item.status;
}

function statusLabel(status) {
  return {
    locked: "Locked",
    available: "Available",
    submitted: "Submitted",
    returned: "Returned for correction",
    completed: "Completed",
  }[status] ?? status;
}

function answerText(answer) {
  if (typeof answer === "string") return answer;
  return answer == null ? "" : String(answer);
}

function formatMessageTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function editableStudentFields(registrationForm) {
  return (registrationForm?.fields ?? []).filter(
    (field) => !["password", "privacy_consent"].includes(field.key),
  );
}

function studentFieldValue(field, dashboard) {
  const registrationData = dashboard.student.registration_data ?? {};
  if (field.key === "full_name") return dashboard.student.full_name ?? dashboard.profile.full_name ?? "";
  if (field.key === "email") return dashboard.student.email ?? dashboard.profile.email ?? "";
  if (field.key === "username") return dashboard.profile.username ?? registrationData.username ?? "";
  if (field.key === "phone") return dashboard.student.whatsapp ?? dashboard.profile.phone ?? "";
  if (field.key === "address") return dashboard.student.address ?? "";
  if (field.key === "denomination") return dashboard.student.denomination ?? "";
  if (field.key === "is_adventist") return Boolean(dashboard.student.is_adventist);
  if (field.type === "checkbox") return Boolean(registrationData[field.key]);
  return registrationData[field.key] ?? "";
}

function buildStudentFormState(dashboard) {
  return Object.fromEntries(
    editableStudentFields(dashboard.registrationForm).map((field) => [
      field.key,
      studentFieldValue(field, dashboard),
    ]),
  );
}

const studentSections = [
  { id: "overview", label: "Overview", icon: GraduationCap },
  { id: "lessons", label: "My lessons", icon: BookOpenText },
  { id: "messages", label: "Messages", icon: PaperPlaneTilt },
  { id: "details", label: "My details", icon: PencilSimpleLine },
];

function StudentDetailField({ field, value, onChange }) {
  if (field.type === "checkbox") {
    return (
      <label className="portal-detail-checkbox">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.key, event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  return (
    <label>
      <span>{field.label}</span>
      {field.type === "textarea" ? (
        <textarea
          rows="3"
          value={value ?? ""}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          value={value ?? ""}
          onChange={(event) => onChange(field.key, event.target.value)}
        >
          <option value="">Choose an option</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
          value={value ?? ""}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
    </label>
  );
}

export function StudentDashboard({ profile, onSignOut, onDeleteAccount }) {
  const [data, setData] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(1);
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState("loading");
  const [lessonMessage, setLessonMessage] = useState("");
  const [studentForm, setStudentForm] = useState({});
  const [detailsNotice, setDetailsNotice] = useState(null);
  const [conversationNotice, setConversationNotice] = useState(null);
  const [studentMessageDraft, setStudentMessageDraft] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  async function refresh() {
    try {
      const dashboard = await loadStudentDashboard();
      setData(dashboard);
      setStatus("ready");
    } catch (error) {
      setLessonMessage(error.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const lessonQuestions = useMemo(
    () => data?.questions.filter((question) => question.lesson_number === selectedLesson) ?? [],
    [data, selectedLesson],
  );
  const lessonSubmissions = useMemo(
    () => data?.submissions.filter((submission) =>
      lessonQuestions.some((question) => question.id === submission.question_id),
    ) ?? [],
    [data, lessonQuestions],
  );
  const detailFields = useMemo(
    () => editableStudentFields(data?.registrationForm),
    [data],
  );

  useEffect(() => {
    setAnswers(
      Object.fromEntries(
        lessonQuestions.map((question) => {
          const submission = lessonSubmissions.find((item) => item.question_id === question.id);
          return [question.id, answerText(submission?.answer)];
        }),
      ),
    );
  }, [lessonQuestions, lessonSubmissions]);

  useEffect(() => {
    if (data) {
      setStudentForm(buildStudentFormState(data));
    }
  }, [data]);

  if (status === "loading") {
    return <main className="portal-loading"><p>Loading your lessons...</p></main>;
  }
  if (status === "error") {
    return <main className="portal-error"><WarningCircle size={42} /><h1>Dashboard unavailable</h1><p>{lessonMessage}</p><button type="button" onClick={refresh}>Try again</button></main>;
  }

  const currentLesson = data.lessons.find((lesson) => lesson.number === selectedLesson);
  const currentStatus = lessonStatus(data.progress, selectedLesson);
  const completedCount = data.progress.filter((item) => item.status === "completed").length;
  const progressPercentage = Math.round((completedCount / 26) * 100);
  const canAnswer = ["available", "returned"].includes(currentStatus);
  const certificate = data.certificates[0];
  const studentMessages = data.messages ?? [];
  async function submitLesson(event) {
    event.preventDefault();
    setLessonMessage("");
    try {
      await submitStudentLesson(selectedLesson, answers);
      setLessonMessage("Lesson submitted to your instructor.");
      await refresh();
    } catch (error) {
      setLessonMessage(error.message);
    }
  }

  function updateStudentForm(field, value) {
    setStudentForm((current) => ({ ...current, [field]: value }));
  }

  async function saveStudentDetails(event) {
    event.preventDefault();
    setDetailsNotice(null);
    setIsSavingDetails(true);
    try {
      await updateStudentData(studentForm);
      setDetailsNotice({
        tone: "success",
        text: "Your details have been updated.",
      });
      await refresh();
    } catch (error) {
      setDetailsNotice({
        tone: "error",
        text: error.message,
      });
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function removeStudentAccount() {
    const confirmed = window.confirm(
      "Delete your DBS Kaduna personal data and dashboard access? This prototype action removes your student record, lesson history, certificates, and messages from the app and signs you out.",
    );
    if (!confirmed) return;

    setDetailsNotice(null);
    setIsDeletingAccount(true);
    try {
      await deleteStudentData();
      await onDeleteAccount();
    } catch (error) {
      setDetailsNotice({
        tone: "error",
        text: error.message,
      });
      setIsDeletingAccount(false);
    }
  }

  async function sendInstructorNote(event) {
    event.preventDefault();
    setConversationNotice(null);
    setIsSendingMessage(true);
    try {
      await sendStudentMessage(studentMessageDraft);
      setStudentMessageDraft("");
      setConversationNotice({
        tone: "success",
        text: "Your message has been sent to your instructor.",
      });
      await refresh();
    } catch (error) {
      setConversationNotice({
        tone: "error",
        text: error.message,
      });
    } finally {
      setIsSendingMessage(false);
    }
  }

  const activeSectionLabel = studentSections.find((section) => section.id === activeSection)?.label ?? "Overview";

  function selectSection(sectionId) {
    setActiveSection(sectionId);
    setIsMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="portal-shell">
      <aside className={isMobileNavOpen ? "portal-dashboard-sidebar portal-dashboard-sidebar--open" : "portal-dashboard-sidebar"}>
        <a href="/" className="portal-sidebar-brand"><img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" /><span><strong>DBS Kaduna</strong><small>Student portal</small></span></a>
        <nav aria-label="Student dashboard sections">
          {studentSections.map((section) => {
            const Icon = section.icon;
            return <button className={activeSection === section.id ? "is-active" : ""} type="button" key={section.id} onClick={() => selectSection(section.id)}><Icon aria-hidden="true" size={21} weight="duotone" /><span>{section.label}</span></button>;
          })}
        </nav>
        <div className="portal-sidebar-footer">
          <a href="/"><ArrowDown aria-hidden="true" size={18} />Public homepage</a>
          <button type="button" onClick={onSignOut}><SignOut aria-hidden="true" size={19} />Sign out</button>
        </div>
      </aside>

      {isMobileNavOpen && <button className="portal-sidebar-backdrop" type="button" onClick={() => setIsMobileNavOpen(false)} aria-label="Close navigation" />}

      <div className="portal-workspace">
        <header className="portal-workspace-header">
          <button className="portal-mobile-menu" type="button" onClick={() => setIsMobileNavOpen(true)} aria-label="Open student navigation"><List aria-hidden="true" size={24} /></button>
          <div><p>Discover Bible School, Kaduna</p><h1>{activeSectionLabel}</h1></div>
          <div className="portal-account"><span><UserCircle aria-hidden="true" size={24} weight="duotone" /></span><div><strong>{profile.full_name}</strong><small>{profile.email}</small></div></div>
          <button className="portal-workspace-signout" type="button" onClick={onSignOut}><SignOut aria-hidden="true" size={19} /><span>Sign out</span></button>
        </header>

      <main className="portal-content">
        {activeSection === "overview" && <>
        <section className="portal-welcome">
          <div><p>Welcome back</p><h1>{profile.full_name}</h1><span>Continue your Discover Bible Study journey.</span></div>
          <div className="portal-welcome-actions">
            <button
              className="portal-welcome-letter is-prompt"
              type="button"
              onClick={downloadWelcomeLetter}
              title="Download your DBS Kaduna welcome letter (PDF)"
            >
              <FilePdf aria-hidden="true" size={24} weight="duotone" />
              <span><strong>Welcome letter</strong><small>Download PDF</small></span>
            </button>
            <div className="portal-progress-card"><strong>{progressPercentage}%</strong><span>{completedCount} of 26 lessons completed</span><div><i style={{ width: `${progressPercentage}%` }} /></div></div>
          </div>
        </section>

        <section className="portal-summary-grid">
          <article><span><GraduationCap size={24} /></span><strong>{data.student.serial_number}</strong><small>Student number</small></article>
          <article><span><BookOpenText size={24} /></span><strong>{statusLabel(currentStatus)}</strong><small>Selected lesson status</small></article>
          <article><span><Certificate size={24} /></span><strong>{certificate ? "Approved" : "Not yet issued"}</strong><small>Certificate access</small></article>
        </section>

        <section className="portal-panel portal-instructor-card">
          <div className="portal-panel-heading"><div><p>Assigned instructor</p><h2>{data.instructor?.name ?? "Awaiting assignment"}</h2></div><UserCircle size={36} weight="duotone" /></div>
          {data.instructor ? (
            <div className="portal-contact-list"><span><EnvelopeSimple size={18} />{data.instructor.email}</span><span><Phone size={18} />{data.instructor.phone || "Phone not provided"}</span></div>
          ) : <p className="portal-muted">The administrator will assign an instructor shortly.</p>}
        </section>

        {certificate && (
          <section className="portal-panel portal-certificate-access">
            <Certificate size={40} weight="duotone" />
            <div><p>Certificate approved</p><h2>Your completion certificate is ready</h2><span>{certificate.storage_path ? `Verification code: ${certificate.verification_code}` : "Your certificate PDF will appear here after the administrator uploads it."}</span></div>
            <button className="portal-primary-button" type="button" disabled={!certificate.storage_path} onClick={() => downloadCertificatePdf(certificate.storage_path, certificate.original_file_name).catch((error) => setLessonMessage(error.message))}><DownloadSimple size={19} />Download certificate PDF</button>
          </section>
        )}
        </>}

        {activeSection === "messages" && <CommunicationHub role="student" />}

        {(activeSection === "details" || activeSection === "messages") && <div className="portal-support-layout">
          {activeSection === "details" && <section className="portal-panel">
            <div className="portal-panel-heading">
              <div>
                <p>Privacy & data controls</p>
                <h2>Correct or delete your information</h2>
                <span>Keep your contact and registration details accurate, or remove your student record from this prototype.</span>
              </div>
              <PencilSimpleLine size={34} weight="duotone" />
            </div>
            <form className="portal-detail-form" onSubmit={saveStudentDetails}>
              {detailFields.map((field) => (
                <StudentDetailField
                  key={field.key}
                  field={field}
                  value={studentForm[field.key]}
                  onChange={updateStudentForm}
                />
              ))}
              {detailsNotice && (
                <div
                  className={
                    detailsNotice.tone === "error"
                      ? "portal-inline-message is-error"
                      : "portal-inline-message"
                  }
                >
                  {detailsNotice.text}
                </div>
              )}
              <div className="portal-detail-actions">
                <button className="portal-primary-button" type="submit" disabled={isSavingDetails}>
                  <PencilSimpleLine size={18} />
                  {isSavingDetails ? "Saving..." : "Save my details"}
                </button>
                <button className="portal-danger-button" type="button" disabled={isDeletingAccount} onClick={removeStudentAccount}>
                  <Trash size={18} />
                  {isDeletingAccount ? "Deleting..." : "Delete my data"}
                </button>
              </div>
            </form>
          </section>}

          {activeSection === "messages" && <section className="portal-panel">
            <div className="portal-panel-heading">
              <div>
                <p>Support conversation</p>
                <h2>Message your instructor</h2>
                <span>
                  {data.instructor
                    ? `Chat directly with ${data.instructor.name}.`
                    : "Messaging becomes available after an instructor is assigned."}
                </span>
              </div>
              <PaperPlaneTilt size={34} weight="duotone" />
            </div>
            {data.instructor ? (
              <>
                <div className="portal-message-thread" role="log" aria-label="Messages with your instructor">
                  {studentMessages.length === 0 ? (
                    <div className="portal-empty">No messages yet. Send your first question or update.</div>
                  ) : studentMessages.map((threadMessage) => {
                    const isOwnMessage = threadMessage.sender_profile_id === data.profile.id;
                    return (
                      <article
                        className={
                          isOwnMessage
                            ? "portal-message-card portal-message-card--own"
                            : "portal-message-card"
                        }
                        key={threadMessage.id}
                      >
                        <strong>{isOwnMessage ? "You" : data.instructor.name}</strong>
                        <p>{threadMessage.body}</p>
                        <small>{formatMessageTime(threadMessage.created_at)}</small>
                      </article>
                    );
                  })}
                </div>
                <form className="portal-message-form" onSubmit={sendInstructorNote}>
                  <label>
                    <span className="sr-only">Message your instructor</span>
                    <textarea
                      rows="4"
                      value={studentMessageDraft}
                      onChange={(event) => setStudentMessageDraft(event.target.value)}
                      placeholder="Ask a question, request prayer, or share a lesson update."
                      required
                    />
                  </label>
                  {conversationNotice && (
                    <div
                      className={
                        conversationNotice.tone === "error"
                          ? "portal-inline-message is-error"
                          : "portal-inline-message"
                      }
                    >
                      {conversationNotice.text}
                    </div>
                  )}
                  <button className="portal-primary-button" type="submit" disabled={isSendingMessage}>
                    <PaperPlaneTilt size={18} />
                    {isSendingMessage ? "Sending..." : "Send message"}
                  </button>
                </form>
              </>
            ) : (
              <div className="portal-empty">Your instructor conversation will appear here once you are assigned.</div>
            )}
          </section>}
        </div>}

        {activeSection === "lessons" && <div className="portal-learning-layout">
          <aside className="portal-panel portal-lesson-nav">
            <div className="portal-panel-heading"><div><p>Course library</p><h2>26 Lessons</h2></div></div>
            <div className="portal-lesson-list">
              {data.lessons.map((lesson) => {
                const itemStatus = lessonStatus(data.progress, lesson.number);
                return (
                  <button className={selectedLesson === lesson.number ? "is-active" : ""} type="button" key={lesson.number} onClick={() => setSelectedLesson(lesson.number)}>
                    <span>{itemStatus === "locked" ? <LockKey size={17} /> : itemStatus === "completed" ? <CheckCircle size={17} /> : lesson.number}</span>
                    <div><strong>{lesson.title}</strong><small className={`portal-status portal-status--${itemStatus}`}>{statusLabel(itemStatus)}</small></div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="portal-panel portal-lesson-workspace">
            <div className="portal-panel-heading">
              <div><p>Lesson {selectedLesson}</p><h2>{currentLesson?.title}</h2><span className={`portal-status portal-status--${currentStatus}`}>{statusLabel(currentStatus)}</span></div>
              <div className="portal-lesson-actions">
                <button className="portal-secondary-button portal-lesson-prompt" type="button" disabled={!currentLesson?.storage_path || currentStatus === "locked"} onClick={() => openLessonPdf(currentLesson?.storage_path).catch((error) => setLessonMessage(error.message))}><FilePdf size={19} />Open Lesson PDF</button>
                <button className="portal-secondary-button portal-lesson-prompt" type="button" disabled={!currentLesson?.storage_path || currentStatus === "locked"} onClick={() => downloadLessonPdf(currentLesson?.storage_path, currentLesson?.original_file_name).catch((error) => setLessonMessage(error.message))}><DownloadSimple size={19} />Download Lesson</button>
              </div>
            </div>

            {currentStatus === "locked" ? (
              <div className="portal-locked"><LockKey size={38} /><h3>This lesson is locked</h3><p>Your instructor will unlock it when you are ready.</p></div>
            ) : lessonQuestions.length === 0 ? (
              <div className="portal-empty">Questions for this lesson have not been published yet.</div>
            ) : (
              <form className="portal-question-form" onSubmit={submitLesson}>
                {lessonQuestions.map((question, index) => {
                  const submission = lessonSubmissions.find((item) => item.question_id === question.id);
                  return (
                    <article key={question.id}>
                      <small>Question {index + 1} · {question.kind.replaceAll("_", " ")}</small>
                      <h3>{question.prompt}</h3>
                      <textarea rows="4" value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} disabled={!canAnswer} required />
                      {submission?.feedback && <div className="portal-feedback"><strong>Instructor comment</strong><p>{submission.feedback}</p><span>Score: {submission.score ?? "Pending"}</span></div>}
                    </article>
                  );
                })}
                {lessonMessage && <div className="portal-inline-message">{lessonMessage}</div>}
                {canAnswer && <button className="portal-primary-button" type="submit">Submit lesson answers</button>}
              </form>
            )}
          </section>
        </div>}
      </main>
      </div>
    </div>
  );
}
