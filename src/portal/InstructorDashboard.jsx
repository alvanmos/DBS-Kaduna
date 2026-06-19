import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  CheckCircle,
  FilePdf,
  GraduationCap,
  LockKey,
  SignOut,
  Student,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  loadInstructorDashboard,
  openLessonPdf,
  requestGraduation,
  reviewSubmission,
  setLessonLock,
  setLessonResult,
} from "./portalRepository.js";

function progressFor(progress, studentId, lessonNumber) {
  return progress.find(
    (item) => item.student_id === studentId && item.lesson_number === lessonNumber,
  );
}

function answerText(answer) {
  return typeof answer === "string" ? answer : answer == null ? "" : String(answer);
}

export function InstructorDashboard({ profile, onSignOut }) {
  const [data, setData] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedLesson, setSelectedLesson] = useState(1);
  const [reviews, setReviews] = useState({});
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

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

  function updateReview(submissionId, changes) {
    setReviews((current) => ({
      ...current,
      [submissionId]: { ...current[submissionId], ...changes },
    }));
  }

  async function saveReview(submissionId, reviewStatus) {
    try {
      const review = reviews[submissionId] ?? {};
      await reviewSubmission(submissionId, review.score, review.feedback, reviewStatus);
      setMessage(reviewStatus === "returned" ? "Answer returned for correction." : "Score and comment saved.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
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

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <a href="/" className="portal-brand"><img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" /><span><strong>DBS Kaduna</strong><small>Instructor Dashboard</small></span></a>
        <div className="portal-account"><UserCircle size={25} /><span><strong>{profile.full_name}</strong><small>{profile.email}</small></span></div>
        <button type="button" onClick={onSignOut}><SignOut size={19} />Sign out</button>
      </header>

      <main className="portal-content">
        <section className="portal-welcome">
          <div><p>Instructor workspace</p><h1>{profile.full_name}</h1><span>Guide assigned students, mark submissions, and request graduation.</span></div>
          <div className="portal-progress-card"><strong>{pendingCount}</strong><span>new answers waiting for marking</span></div>
        </section>

        <section className="portal-summary-grid">
          <article><span><Student size={24} /></span><strong>{data.students.length}</strong><small>Assigned students</small></article>
          <article><span><BookOpenText size={24} /></span><strong>26</strong><small>Course lessons</small></article>
          <article><span><CheckCircle size={24} /></span><strong>{pendingCount}</strong><small>Waiting for marking</small></article>
        </section>

        <div className="portal-teacher-layout">
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
                <div className="portal-panel-heading">
                  <div><p>Student record</p><h2>{selectedStudent.full_name}</h2><span>{completedCount} of 26 lessons completed</span></div>
                  {completedCount === 26 && (
                    <button className="portal-primary-button" type="button" disabled={graduationRequested} onClick={sendGraduationRequest}><GraduationCap size={19} />{graduationRequested ? "Graduation requested" : "Request graduation"}</button>
                  )}
                </div>

                <div className="portal-teacher-lessons">
                  {data.lessons.map((lesson) => {
                    const item = progressFor(data.progress, selectedStudent.id, lesson.number);
                    return <button className={selectedLesson === lesson.number ? "is-active" : ""} type="button" onClick={() => setSelectedLesson(lesson.number)} key={lesson.number}><span>{item?.is_locked ? <LockKey size={16} /> : lesson.number}</span><strong>{lesson.title}</strong><small>{item?.status?.replaceAll("_", " ") || "not started"}</small></button>;
                  })}
                </div>

                <div className="portal-lesson-review-heading">
                  <div><p>Lesson {selectedLesson}</p><h3>{currentLesson?.title}</h3></div>
                  <div>
                    <button className="portal-secondary-button" type="button" disabled={!currentLesson?.storage_path} onClick={() => openLessonPdf(currentLesson?.storage_path).catch((error) => setMessage(error.message))}><FilePdf size={18} />Lesson PDF</button>
                    <button className="portal-secondary-button" type="button" onClick={toggleLock}>{currentProgress?.is_locked ? "Unlock lesson" : "Lock lesson"}</button>
                  </div>
                </div>

                {lessonQuestions.length === 0 ? <div className="portal-empty">No published questions for this lesson.</div> : (
                  <div className="portal-marking-list">
                    {lessonQuestions.map((question, index) => {
                      const submission = lessonSubmissions.find((item) => item.question_id === question.id);
                      const review = submission ? reviews[submission.id] ?? {} : {};
                      return (
                        <article key={question.id}>
                          <small>Question {index + 1}</small><h3>{question.prompt}</h3>
                          <div className="portal-student-answer"><strong>Student answer</strong><p>{submission ? answerText(submission.answer) : "Not submitted"}</p></div>
                          {submission && (
                            <div className="portal-review-fields">
                              <label>Score<input type="number" min="0" max="100" value={review.score ?? ""} onChange={(event) => updateReview(submission.id, { score: event.target.value })} /></label>
                              <label>Comment<textarea rows="3" value={review.feedback ?? ""} onChange={(event) => updateReview(submission.id, { feedback: event.target.value })} /></label>
                              <div><button className="portal-secondary-button" type="button" onClick={() => saveReview(submission.id, "returned")}>Return answer</button><button className="portal-primary-button" type="button" onClick={() => saveReview(submission.id, "marked")}>Save score</button></div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                {lessonSubmissions.length > 0 && (
                  <div className="portal-lesson-result-actions"><button className="portal-secondary-button" type="button" onClick={() => updateLessonResult("returned")}>Return lesson for correction</button><button className="portal-primary-button" type="button" onClick={() => updateLessonResult("completed")}>Mark lesson completed</button></div>
                )}
                {message && <div className="portal-inline-message">{message}</div>}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
