import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  BookOpenText,
  CheckCircle,
  EnvelopeSimple,
  FilePdf,
  GraduationCap,
  LockKey,
  List,
  MapPin,
  PaperPlaneTilt,
  Phone,
  SignOut,
  Student,
  UserCircle,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  loadInstructorDashboard,
  openLessonPdf,
  requestGraduation,
  reviewSubmission,
  sendInstructorMessageToAdmin,
  sendInstructorMessageToStudent,
  setLessonLock,
  setLessonResult,
} from "./portalRepository.js";
import { CommunicationHub } from "../communication/CommunicationHub.jsx";
import "../communication/communication.css";
import { ZoomClasses } from "./ZoomClasses.jsx";

function progressFor(progress, studentId, lessonNumber) {
  return progress.find(
    (item) => item.student_id === studentId && item.lesson_number === lessonNumber,
  );
}

function answerText(answer) {
  return typeof answer === "string" ? answer : answer == null ? "" : String(answer);
}

function formatMessageTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StudentContactDetails({ student }) {
  return (
    <section className="portal-student-contact-card" aria-label={`${student.full_name}'s contact information`}>
      <p>Student contact information</p>
      <div>
        <span><EnvelopeSimple aria-hidden="true" size={18} /><strong>Email</strong>{student.email ? <a href={`mailto:${student.email}`}>{student.email}</a> : <em>Not provided</em>}</span>
        <span><Phone aria-hidden="true" size={18} /><strong>Phone</strong>{student.whatsapp ? <a href={`tel:${student.whatsapp}`}>{student.whatsapp}</a> : <em>Not provided</em>}</span>
        <span><MapPin aria-hidden="true" size={18} /><strong>Address</strong><b>{student.address || student.location_name || "Not provided"}</b></span>
      </div>
    </section>
  );
}

const instructorSections = [
  { id: "overview", label: "Overview", icon: GraduationCap },
  { id: "reviews", label: "Student reviews", icon: Student },
  { id: "classes", label: "Zoom Classes", icon: VideoCamera },
  { id: "messages", label: "Messages", icon: PaperPlaneTilt },
];

export function InstructorDashboard({ profile, onSignOut }) {
  const [data, setData] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedLesson, setSelectedLesson] = useState(1);
  const [reviews, setReviews] = useState({});
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [studentMessageDraft, setStudentMessageDraft] = useState("");
  const [adminMessageDraft, setAdminMessageDraft] = useState("");
  const [studentConversationNotice, setStudentConversationNotice] = useState(null);
  const [adminConversationNotice, setAdminConversationNotice] = useState(null);
  const [isSendingStudentMessage, setIsSendingStudentMessage] = useState(false);
  const [isSendingAdminMessage, setIsSendingAdminMessage] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const [activeSection, setActiveSection] = useState("overview");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  async function refresh() {
    try {
      const dashboard = await loadInstructorDashboard();
      setData(dashboard);
      setSelectedStudentId((current) => current || dashboard.students[0]?.id || "");
      setStatus("ready");
    } catch (error) {
      setMessage(error.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedStudent = data?.students.find((student) => student.id === selectedStudentId);
  const lessonQuestions = useMemo(
    () => data?.questions.filter((question) => question.lesson_number === selectedLesson) ?? [],
    [data, selectedLesson],
  );
  const lessonSubmissions = useMemo(
    () => data?.submissions.filter(
      (submission) =>
        submission.student_id === selectedStudentId &&
        lessonQuestions.some((question) => question.id === submission.question_id),
    ) ?? [],
    [data, lessonQuestions, selectedStudentId],
  );
  const reviewQueue = useMemo(
    () => lessonQuestions
      .filter((question) => question.kind !== "thought")
      .map((question) => ({
        question,
        submission: lessonSubmissions.find((submission) => submission.question_id === question.id),
      }))
      .filter((item) => item.submission),
    [lessonQuestions, lessonSubmissions],
  );
  const selectedStudentMessages = useMemo(
    () => data?.studentMessages.filter((threadMessage) => threadMessage.student_id === selectedStudentId) ?? [],
    [data, selectedStudentId],
  );

  useEffect(() => {
    setReviews(
      Object.fromEntries(
        lessonSubmissions.map((submission) => [
          submission.id,
          { score: submission.score ?? "", feedback: submission.feedback ?? "" },
        ]),
      ),
    );
  }, [lessonSubmissions]);

  useEffect(() => {
    setActiveReviewIndex(0);
    setMessage("");
  }, [selectedStudentId, selectedLesson]);

  if (status === "loading") return <main className="portal-loading"><p>Loading assigned students...</p></main>;
  if (status === "error") return <main className="portal-error"><WarningCircle size={42} /><h1>Dashboard unavailable</h1><p>{message}</p><button type="button" onClick={refresh}>Try again</button></main>;

  const pendingCount = data.submissions.filter((item) => item.status === "submitted").length;
  const currentProgress = selectedStudent
    ? progressFor(data.progress, selectedStudent.id, selectedLesson)
    : null;
  const currentLesson = data.lessons.find((lesson) => lesson.number === selectedLesson);
  const completedCount = selectedStudent
    ? data.progress.filter((item) => item.student_id === selectedStudent.id && item.status === "completed").length
    : 0;
  const graduationRequested = data.graduationRequests.some(
    (item) => item.student_id === selectedStudentId && item.status === "pending",
  );
  const primaryAdmin = data.admins[0] ?? null;
  const activeReview = reviewQueue[activeReviewIndex];
  const activeReviewQuestion = activeReview?.question;
  const activeReviewSubmission = activeReview?.submission;
  const activeReviewState = activeReviewSubmission ? reviews[activeReviewSubmission.id] ?? {} : {};
  const activeReviewIsMarked = activeReviewSubmission?.status === "marked";
  const hasNextReview = activeReviewIndex < reviewQueue.length - 1;

  function updateReview(submissionId, changes) {
    setReviews((current) => ({
      ...current,
      [submissionId]: { ...current[submissionId], ...changes },
    }));
  }

  async function saveReview(submissionId, reviewStatus) {
    const review = reviews[submissionId] ?? {};
    if (reviewStatus === "marked" && (review.score === "" || review.score == null)) {
      setMessage("Enter a score before marking this question.");
      return;
    }

    try {
      setIsSavingReview(true);
      await reviewSubmission(submissionId, review.score, review.feedback, reviewStatus);
      setMessage(
        reviewStatus === "returned"
          ? "Answer returned for correction. Grade it before continuing."
          : hasNextReview
            ? `Question ${activeReviewIndex + 1} marked. Click Next Question when you are ready.`
            : "Score and comment saved. All submitted questions in this lesson are marked.",
      );
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSavingReview(false);
    }
  }

  async function toggleLock() {
    try {
      await setLessonLock(selectedStudent.id, selectedLesson, !currentProgress?.is_locked);
      setMessage(currentProgress?.is_locked ? "Lesson unlocked." : "Lesson locked.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateLessonResult(result) {
    try {
      await setLessonResult(selectedStudent.id, selectedLesson, result);
      setMessage(result === "completed" ? "Lesson marked completed." : "Lesson returned for correction.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function sendGraduationRequest() {
    try {
      await requestGraduation(selectedStudent.id, data.instructor.id);
      setMessage("Graduation request sent to the administrator.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function sendStudentNote(event) {
    event.preventDefault();
    if (!selectedStudent) return;
    setStudentConversationNotice(null);
    setIsSendingStudentMessage(true);
    try {
      await sendInstructorMessageToStudent(selectedStudent.id, studentMessageDraft);
      setStudentMessageDraft("");
      setStudentConversationNotice({
        tone: "success",
        text: `Message sent to ${selectedStudent.full_name}.`,
      });
      await refresh();
    } catch (error) {
      setStudentConversationNotice({
        tone: "error",
        text: error.message,
      });
    } finally {
      setIsSendingStudentMessage(false);
    }
  }

  async function sendAdminNote(event) {
    event.preventDefault();
    setAdminConversationNotice(null);
    setIsSendingAdminMessage(true);
    try {
      await sendInstructorMessageToAdmin(adminMessageDraft);
      setAdminMessageDraft("");
      setAdminConversationNotice({
        tone: "success",
        text: "Message sent to the administrator.",
      });
      await refresh();
    } catch (error) {
      setAdminConversationNotice({
        tone: "error",
        text: error.message,
      });
    } finally {
      setIsSendingAdminMessage(false);
    }
  }

  const activeSectionLabel = instructorSections.find((section) => section.id === activeSection)?.label ?? "Overview";

  function selectSection(sectionId) {
    setActiveSection(sectionId);
    setIsMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="portal-shell">
      <aside className={isMobileNavOpen ? "portal-dashboard-sidebar portal-dashboard-sidebar--open" : "portal-dashboard-sidebar"}>
        <a href="/" className="portal-sidebar-brand"><img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" /><span><strong>DBS Kaduna</strong><small>Instructor portal</small></span></a>
        <nav aria-label="Instructor dashboard sections">
          {instructorSections.map((section) => {
            const Icon = section.icon;
            const count = section.id === "reviews" ? pendingCount : undefined;
            return <button className={activeSection === section.id ? "is-active" : ""} type="button" key={section.id} onClick={() => selectSection(section.id)}><Icon aria-hidden="true" size={21} weight="duotone" /><span>{section.label}</span>{count > 0 && <small>{count}</small>}</button>;
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
          <button className="portal-mobile-menu" type="button" onClick={() => setIsMobileNavOpen(true)} aria-label="Open instructor navigation"><List aria-hidden="true" size={24} /></button>
          <div><p>Discover Bible School, Kaduna</p><h1>{activeSectionLabel}</h1></div>
          <div className="portal-account"><span><UserCircle aria-hidden="true" size={24} weight="duotone" /></span><div><strong>{profile.full_name}</strong><small>{profile.email}</small></div></div>
          <button className="portal-workspace-signout" type="button" onClick={onSignOut}><SignOut aria-hidden="true" size={19} /><span>Sign out</span></button>
        </header>

      <main className="portal-content">
        {activeSection === "overview" && <>
        <section className="portal-welcome">
          <div><p>Instructor workspace</p><h1>{profile.full_name}</h1><span>Guide assigned students, mark submissions, and request graduation.</span></div>
          <div className="portal-progress-card"><strong>{pendingCount}</strong><span>new answers waiting for marking</span></div>
        </section>

        <section className="portal-summary-grid">
          <article><span><Student size={24} /></span><strong>{data.students.length}</strong><small>Assigned students</small></article>
          <article><span><BookOpenText size={24} /></span><strong>26</strong><small>Course lessons</small></article>
          <article><span><CheckCircle size={24} /></span><strong>{pendingCount}</strong><small>Waiting for marking</small></article>
        </section>
        </>}

        {activeSection === "messages" && <CommunicationHub role="instructor" />}

        {activeSection === "classes" && <ZoomClasses role="instructor" lessons={data.lessons} students={data.students} />}

        {(activeSection === "reviews" || activeSection === "messages") && <div className="portal-teacher-layout">
          <aside className="portal-panel portal-student-list">
            <div className="portal-panel-heading"><div><p>Your class</p><h2>Assigned students</h2></div></div>
            {data.students.length === 0 ? <div className="portal-empty">No students are assigned yet.</div> : data.students.map((student) => {
              const studentPending = data.submissions.filter((item) => item.student_id === student.id && item.status === "submitted").length;
              return <button className={selectedStudentId === student.id ? "is-active" : ""} type="button" key={student.id} onClick={() => { setSelectedStudentId(student.id); setSelectedLesson(1); }}><span><strong>{student.full_name}</strong><small>{student.email || student.serial_number}</small></span>{studentPending > 0 && <i>{studentPending}</i>}</button>;
            })}
          </aside>

          <section className="portal-panel portal-teacher-workspace">
            {!selectedStudent ? (
              <div className="portal-empty">Choose an assigned student.</div>
            ) : (
              <>
                {activeSection === "reviews" && <>
                <div className="portal-panel-heading">
                  <div><p>Student record</p><h2>{selectedStudent.full_name}</h2><span>{completedCount} of 26 lessons completed</span></div>
                  {completedCount === 26 && (
                    <button className="portal-primary-button" type="button" disabled={graduationRequested} onClick={sendGraduationRequest}><GraduationCap size={19} />{graduationRequested ? "Graduation requested" : "Request graduation"}</button>
                  )}
                </div>

                <StudentContactDetails student={selectedStudent} />

                <div className="portal-teacher-lessons">
                  {data.lessons.map((lesson) => {
                    const item = progressFor(data.progress, selectedStudent.id, lesson.number);
                    return <button className={selectedLesson === lesson.number ? "is-active" : ""} type="button" onClick={() => setSelectedLesson(lesson.number)} key={lesson.number}><span>{item?.is_locked ? <LockKey size={16} /> : lesson.number}</span><strong>{lesson.title}</strong><small>{item?.status?.replaceAll("_", " ") || "not started"}</small></button>;
                  })}
                </div>

                <div className="portal-lesson-review-heading">
                  <div><p>Lesson {selectedLesson}</p><h3>{currentLesson?.title}</h3></div>
                  <div>
                    <button className="portal-secondary-button portal-lesson-prompt" type="button" disabled={!currentLesson?.storage_path} onClick={() => openLessonPdf(currentLesson?.storage_path).catch((error) => setMessage(error.message))}><FilePdf size={18} />Lesson PDF</button>
                    <button className="portal-secondary-button" type="button" onClick={toggleLock}>{currentProgress?.is_locked ? "Unlock lesson" : "Lock lesson"}</button>
                  </div>
                </div>

                {lessonQuestions.length === 0 ? <div className="portal-empty">No published questions for this lesson.</div> : reviewQueue.length === 0 ? (
                  <div className="portal-empty">This student has no submitted, gradeable questions in this lesson yet.</div>
                ) : (
                  <div className="portal-marking-list portal-instructor-review-flow">
                    <div className="portal-question-progress" aria-label={`Submitted question ${activeReviewIndex + 1} of ${reviewQueue.length}`}>
                      <span>Submitted questions</span>
                      <strong>Question {activeReviewIndex + 1} of {reviewQueue.length}</strong>
                      <div aria-hidden="true"><i style={{ width: `${((activeReviewIndex + 1) / reviewQueue.length) * 100}%` }} /></div>
                    </div>
                    {activeReviewQuestion && activeReviewSubmission && <article className={`portal-question-card portal-instructor-question-card portal-question-card--${activeReviewQuestion.kind}`}>
                      <small>Question {activeReviewIndex + 1} · {activeReviewQuestion.kind.replaceAll("_", " ")}</small>
                      <h3>{activeReviewQuestion.prompt}</h3>
                      <div className="portal-student-answer"><strong>{selectedStudent.full_name}'s answer</strong><p>{answerText(activeReviewSubmission.answer)}</p></div>
                      <div className="portal-review-fields">
                        <label>Score<input type="number" min="0" max="100" value={activeReviewState.score ?? ""} onChange={(event) => updateReview(activeReviewSubmission.id, { score: event.target.value })} disabled={isSavingReview} required /></label>
                        <label>Comment<textarea rows="4" value={activeReviewState.feedback ?? ""} onChange={(event) => updateReview(activeReviewSubmission.id, { feedback: event.target.value })} disabled={isSavingReview} placeholder="Encourage the student and explain the grade." /></label>
                        <div className="portal-review-actions">
                          <button className="portal-secondary-button" type="button" disabled={isSavingReview} onClick={() => saveReview(activeReviewSubmission.id, "returned")}>Return for correction</button>
                          <button className="portal-primary-button" type="button" disabled={isSavingReview} onClick={() => saveReview(activeReviewSubmission.id, "marked")}>{isSavingReview ? "Saving grade..." : activeReviewIsMarked ? "Update grade" : "Save score"}</button>
                          {hasNextReview && activeReviewIsMarked && <button className="portal-secondary-button portal-next-question" type="button" onClick={() => { setActiveReviewIndex((index) => index + 1); setMessage(""); }}>Next Question <span aria-hidden="true">→</span></button>}
                        </div>
                      </div>
                    </article>}
                  </div>
                )}
                {lessonSubmissions.length > 0 && (
                  <div className="portal-lesson-result-actions"><button className="portal-secondary-button" type="button" onClick={() => updateLessonResult("returned")}>Return lesson for correction</button><button className="portal-primary-button" type="button" onClick={() => updateLessonResult("completed")}>Mark lesson completed</button></div>
                )}
                {message && <div className="portal-inline-message">{message}</div>}

                </>}

                {activeSection === "messages" && <div className="portal-conversation-grid">
                  <section className="portal-panel">
                    <div className="portal-panel-heading">
                      <div>
                        <p>Student conversation</p>
                        <h2>Message {selectedStudent.full_name}</h2>
                        <span>Respond directly to your assigned student from this workspace.</span>
                      </div>
                      <PaperPlaneTilt size={34} weight="duotone" />
                    </div>
                    <StudentContactDetails student={selectedStudent} />
                    <div className="portal-message-thread" role="log" aria-label={`Messages with ${selectedStudent.full_name}`}>
                      {selectedStudentMessages.length === 0 ? (
                        <div className="portal-empty">No messages yet with this student.</div>
                      ) : selectedStudentMessages.map((threadMessage) => {
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
                            <strong>{isOwnMessage ? "You" : selectedStudent.full_name}</strong>
                            <p>{threadMessage.body}</p>
                            <small>{formatMessageTime(threadMessage.created_at)}</small>
                          </article>
                        );
                      })}
                    </div>
                    <form className="portal-message-form" onSubmit={sendStudentNote}>
                      <label>
                        <span className="sr-only">Message student</span>
                        <textarea
                          rows="4"
                          value={studentMessageDraft}
                          onChange={(event) => setStudentMessageDraft(event.target.value)}
                          placeholder="Encourage the student, answer questions, or give next-step guidance."
                          required
                        />
                      </label>
                      {studentConversationNotice && (
                        <div
                          className={
                            studentConversationNotice.tone === "error"
                              ? "portal-inline-message is-error"
                              : "portal-inline-message"
                          }
                        >
                          {studentConversationNotice.text}
                        </div>
                      )}
                      <button className="portal-primary-button" type="submit" disabled={isSendingStudentMessage}>
                        <PaperPlaneTilt size={18} />
                        {isSendingStudentMessage ? "Sending..." : "Send to student"}
                      </button>
                    </form>
                  </section>

                  <section className="portal-panel">
                    <div className="portal-panel-heading">
                      <div>
                        <p>Administrator conversation</p>
                        <h2>{primaryAdmin?.full_name ?? "DBS Kaduna admin"}</h2>
                        <span>{primaryAdmin?.email ?? "Use this channel for volunteer-instructor support and coordination."}</span>
                      </div>
                      <UserCircle size={34} weight="duotone" />
                    </div>
                    <div className="portal-message-thread" role="log" aria-label="Messages with the administrator">
                      {data.adminMessages.length === 0 ? (
                        <div className="portal-empty">No messages yet with administration.</div>
                      ) : data.adminMessages.map((threadMessage) => {
                        const isOwnMessage = threadMessage.sender_profile_id === data.profile.id;
                        const senderName = isOwnMessage ? "You" : primaryAdmin?.full_name ?? "Administrator";
                        return (
                          <article
                            className={
                              isOwnMessage
                                ? "portal-message-card portal-message-card--own"
                                : "portal-message-card"
                            }
                            key={threadMessage.id}
                          >
                            <strong>{senderName}</strong>
                            <p>{threadMessage.body}</p>
                            <small>{formatMessageTime(threadMessage.created_at)}</small>
                          </article>
                        );
                      })}
                    </div>
                    <form className="portal-message-form" onSubmit={sendAdminNote}>
                      <label>
                        <span className="sr-only">Message administrator</span>
                        <textarea
                          rows="4"
                          value={adminMessageDraft}
                          onChange={(event) => setAdminMessageDraft(event.target.value)}
                          placeholder="Send a question or update to the administrator."
                          required
                        />
                      </label>
                      {adminConversationNotice && (
                        <div
                          className={
                            adminConversationNotice.tone === "error"
                              ? "portal-inline-message is-error"
                              : "portal-inline-message"
                          }
                        >
                          {adminConversationNotice.text}
                        </div>
                      )}
                      <button className="portal-primary-button" type="submit" disabled={isSendingAdminMessage}>
                        <PaperPlaneTilt size={18} />
                        {isSendingAdminMessage ? "Sending..." : "Send to admin"}
                      </button>
                    </form>
                  </section>
                </div>}
              </>
            )}
          </section>
        </div>}
      </main>
      </div>
    </div>
  );
}
