import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  Certificate,
  CheckCircle,
  DownloadSimple,
  EnvelopeSimple,
  FilePdf,
  GraduationCap,
  LockKey,
  Phone,
  SignOut,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  downloadCertificatePdf,
  downloadLessonPdf,
  loadStudentDashboard,
  openLessonPdf,
  submitStudentLesson,
} from "./portalRepository.js";

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

export function StudentDashboard({ profile, onSignOut }) {
  const [data, setData] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(1);
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const dashboard = await loadStudentDashboard();
      setData(dashboard);
      setStatus("ready");
    } catch (error) {
      setMessage(error.message);
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

  if (status === "loading") {
    return <main className="portal-loading"><p>Loading your lessons...</p></main>;
  }
  if (status === "error") {
    return <main className="portal-error"><WarningCircle size={42} /><h1>Dashboard unavailable</h1><p>{message}</p><button type="button" onClick={refresh}>Try again</button></main>;
  }

  const currentLesson = data.lessons.find((lesson) => lesson.number === selectedLesson);
  const currentStatus = lessonStatus(data.progress, selectedLesson);
  const completedCount = data.progress.filter((item) => item.status === "completed").length;
  const progressPercentage = Math.round((completedCount / 26) * 100);
  const canAnswer = ["available", "returned"].includes(currentStatus);
  const certificate = data.certificates[0];

  async function submitLesson(event) {
    event.preventDefault();
    setMessage("");
    try {
      await submitStudentLesson(selectedLesson, answers);
      setMessage("Lesson submitted to your instructor.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <a href="/" className="portal-brand"><img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" /><span><strong>DBS Kaduna</strong><small>Student Dashboard</small></span></a>
        <div className="portal-account"><UserCircle size={25} /><span><strong>{profile.full_name}</strong><small>{profile.email}</small></span></div>
        <button type="button" onClick={onSignOut}><SignOut size={19} />Sign out</button>
      </header>

      <main className="portal-content">
        <section className="portal-welcome">
          <div><p>Welcome back</p><h1>{profile.full_name}</h1><span>Continue your Discover Bible Study journey.</span></div>
          <div className="portal-progress-card"><strong>{progressPercentage}%</strong><span>{completedCount} of 26 lessons completed</span><div><i style={{ width: `${progressPercentage}%` }} /></div></div>
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

        <div className="portal-learning-layout">
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
                <button className="portal-secondary-button" type="button" disabled={!currentLesson?.storage_path || currentStatus === "locked"} onClick={() => openLessonPdf(currentLesson?.storage_path).catch((error) => setMessage(error.message))}><FilePdf size={19} />Open lesson PDF</button>
                <button className="portal-secondary-button" type="button" disabled={!currentLesson?.storage_path || currentStatus === "locked"} onClick={() => downloadLessonPdf(currentLesson?.storage_path, currentLesson?.original_file_name).catch((error) => setMessage(error.message))}><DownloadSimple size={19} />Download lesson</button>
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
                {message && <div className="portal-inline-message">{message}</div>}
                {canAnswer && <button className="portal-primary-button" type="submit">Submit lesson answers</button>}
              </form>
            )}
          </section>
        </div>

        {certificate && (
          <section className="portal-panel portal-certificate-access">
            <Certificate size={40} weight="duotone" />
            <div><p>Certificate approved</p><h2>Your completion certificate is ready</h2><span>{certificate.storage_path ? `Verification code: ${certificate.verification_code}` : "Your certificate PDF will appear here after the administrator uploads it."}</span></div>
            <button className="portal-primary-button" type="button" disabled={!certificate.storage_path} onClick={() => downloadCertificatePdf(certificate.storage_path, certificate.original_file_name).catch((error) => setMessage(error.message))}><DownloadSimple size={19} />Download certificate PDF</button>
          </section>
        )}
      </main>
    </div>
  );
}
