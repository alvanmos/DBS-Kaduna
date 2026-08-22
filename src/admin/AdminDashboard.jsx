import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CaretDown,
  Certificate,
  ChartBar,
  Check,
  CheckCircle,
  Clock,
  ClipboardText,
  Copy,
  DownloadSimple,
  FilePdf,
  FloppyDisk,
  Gauge,
  GraduationCap,
  List,
  MapPin,
  Megaphone,
  Newspaper,
  PaperPlaneTilt,
  PencilSimpleLine,
  Phone,
  Plus,
  Question,
  QrCode,
  SignOut,
  Student,
  Trash,
  UploadSimple,
  UserCheck,
  UserCircle,
  UserMinus,
  UsersThree,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { adminSections } from "./adminData.js";
import { ZoomAdministration } from "../portal/ZoomAdministration.jsx";

const sectionIcons = {
  dashboard: Gauge,
  students: Student,
  instructors: UsersThree,
  lessons: BookOpenText,
  questions: Question,
  certificates: Certificate,
  reports: ChartBar,
  news: Newspaper,
  recruitment: QrCode,
  forms: ClipboardText,
  zoom: VideoCamera,
};

const pageHeadingIcons = {
  "Dashboard summary": Gauge,
  "Student management": Student,
  "Instructor management": UsersThree,
  "Lesson management": BookOpenText,
  "Question management": Question,
  Certificates: Certificate,
  Reports: ChartBar,
  Recruitment: QrCode,
  "Registration forms": ClipboardText,
  News: Newspaper,
};

function countWhere(items, predicate) {
  return items.filter(predicate).length;
}

function readableError(error) {
  return error?.message || "The secure operation could not be completed.";
}

function escapeCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function exportExcelFile(fileName, title, columns, rows) {
  const header = columns.map((column) => `<th>${escapeCell(column.label)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeCell(row[column.key])}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const workbook = `<!doctype html><html><head><meta charset="UTF-8"></head><body><h2>${escapeCell(
    title,
  )}</h2><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function answerText(answer) {
  if (answer === null || answer === undefined) return "";
  if (typeof answer === "string") return answer;
  if (typeof answer === "number" || typeof answer === "boolean") return String(answer);
  if (Array.isArray(answer)) return answer.map(answerText).filter(Boolean).join(", ");
  if (typeof answer === "object") {
    return Object.entries(answer)
      .map(([key, value]) => `${key.replaceAll("_", " ")}: ${answerText(value)}`)
      .join("\n");
  }
  return String(answer);
}

function safeDownloadName(value) {
  return String(value ?? "dbs-kaduna")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function exportLessonAnswersWord({ student, lesson, submissions, questions }) {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const submittedAt = submissions
    .map((submission) => submission.submittedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const answers = submissions
    .map((submission, index) => {
      const question = questionsById.get(submission.questionId);
      if (!question) return "";
      const score = submission.score === null || submission.score === undefined
        ? ""
        : `<p class="meta"><strong>Score:</strong> ${escapeCell(submission.score)}</p>`;
      const feedback = submission.feedback
        ? `<p class="meta"><strong>Instructor feedback:</strong> ${escapeCell(submission.feedback)}</p>`
        : "";
      return `<section><h2>Question ${index + 1}</h2><p class="question">${escapeCell(question.prompt)}</p><p class="label">Student answer</p><p class="answer">${escapeCell(answerText(submission.answer)).replaceAll("\n", "<br>")}</p>${score}${feedback}</section>`;
    })
    .filter(Boolean)
    .join("");
  const wordDocument = `<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family:Calibri,Arial,sans-serif;color:#172b4d;line-height:1.5;margin:36pt}h1{color:#072c54;margin-bottom:4pt}h2{color:#107e58;font-size:14pt;margin:22pt 0 6pt}.meta{color:#526475;margin:3pt 0}.question{font-weight:700;margin:0 0 8pt}.label{color:#8a6500;font-size:9pt;font-weight:700;text-transform:uppercase;margin:0}.answer{white-space:normal;border-left:3pt solid #d2af55;padding-left:12pt;margin-top:4pt}section{page-break-inside:avoid}</style></head><body><h1>DBS Kaduna — Lesson ${escapeCell(lesson.number)} Answers</h1><p class="meta"><strong>Student:</strong> ${escapeCell(student.name)}<br><strong>Serial:</strong> ${escapeCell(student.serial)}<br><strong>Lesson:</strong> ${escapeCell(lesson.title)}${submittedAt ? `<br><strong>Latest submission:</strong> ${escapeCell(new Date(submittedAt).toLocaleString())}` : ""}</p>${answers}</body></html>`;
  const blob = new Blob([wordDocument], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeDownloadName(student.name)}-lesson-${lesson.number}-answers.doc`;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`admin-status admin-status--${tone}`}>{children}</span>;
}

function EmptyState({ children }) {
  return <p className="admin-empty-state">{children}</p>;
}

function PageHeading({ eyebrow, title, description, action }) {
  const Icon = pageHeadingIcons[eyebrow] ?? Gauge;
  return (
    <div className="admin-page-heading">
      <div className="admin-page-heading__copy">
        <span className="admin-page-heading__icon"><Icon aria-hidden="true" size={27} weight="duotone" /></span>
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
      </div>
      {action}
    </div>
  );
}

function MetricCard({ label, value, detail, Icon, tone }) {
  return (
    <article className={`admin-metric admin-metric--${tone}`}>
      <span className="admin-metric__icon">
        <Icon aria-hidden="true" size={25} weight="duotone" />
      </span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function formatMessageTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DashboardSummary({ students, instructors }) {
  const summary = {
    totalStudents: students.length,
    activeStudents: countWhere(students, (student) => student.status === "Active"),
    inactiveStudents: countWhere(students, (student) => student.status === "Inactive"),
    baptized: countWhere(students, (student) => student.milestone === "Baptized"),
    awaitingBaptism: countWhere(
      students,
      (student) => student.milestone === "Awaiting Baptism",
    ),
    awaitingGraduation: countWhere(
      students,
      (student) => student.milestone === "Awaiting Graduation",
    ),
    graduated: countWhere(students, (student) => student.milestone === "Graduated"),
    unassigned: countWhere(students, (student) => !student.instructorId),
    totalInstructors: instructors.length,
    inactiveInstructors: countWhere(
      instructors,
      (instructor) => instructor.status === "Inactive",
    ),
    unmarked: instructors.reduce(
      (total, instructor) => total + instructor.unmarked,
      0,
    ),
    graduationRequests: instructors.reduce(
      (total, instructor) => total + instructor.graduationRequests,
      0,
    ),
  };

  return (
    <>
      <PageHeading
        eyebrow="Dashboard summary"
        title="School overview"
        description="A live operational view of students, instructors, submissions, and graduation activity."
      />

      <div className="admin-metric-grid">
        <MetricCard
          label="Total students"
          value={summary.totalStudents}
          detail={`${summary.activeStudents} active / ${summary.inactiveStudents} inactive`}
          Icon={GraduationCap}
          tone="blue"
        />
        <MetricCard
          label="Baptism journey"
          value={summary.baptized}
          detail={`${summary.awaitingBaptism} awaiting baptism`}
          Icon={CheckCircle}
          tone="green"
        />
        <MetricCard
          label="Graduation"
          value={summary.graduated}
          detail={`${summary.awaitingGraduation} requests awaiting`}
          Icon={Certificate}
          tone="gold"
        />
        <MetricCard
          label="Need an instructor"
          value={summary.unassigned}
          detail="New students awaiting assignment"
          Icon={UserCheck}
          tone="red"
        />
      </div>

      <div className="admin-summary-strip">
        <span>
          <UsersThree aria-hidden="true" size={22} />
          <strong>{summary.totalInstructors}</strong> instructors
        </span>
        <span>
          <UserMinus aria-hidden="true" size={22} />
          <strong>{summary.inactiveInstructors}</strong> inactive
        </span>
        <span>
          <Clock aria-hidden="true" size={22} />
          <strong>{summary.unmarked}</strong> unmarked submissions
        </span>
        <span>
          <Certificate aria-hidden="true" size={22} />
          <strong>{summary.graduationRequests}</strong> graduation requests
        </span>
      </div>

      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Students</h3>
              <p>Names, serial numbers, denomination, and current progress.</p>
            </div>
            <StatusBadge tone="blue">{students.length} records</StatusBadge>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Denomination</th>
                  <th>Progress</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <strong>{student.name}</strong>
                      <small>{student.serial}</small>
                    </td>
                    <td>{student.denomination}</td>
                    <td>{student.progress}%</td>
                    <td>{student.milestone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Instructors</h3>
              <p>Contacts, workload, pending marking, and status.</p>
            </div>
            <StatusBadge tone="green">{instructors.length} records</StatusBadge>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Instructor</th>
                  <th>Contact</th>
                  <th>Load</th>
                  <th>Unmarked</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((instructor) => (
                  <tr key={instructor.id}>
                    <td>
                      <strong>{instructor.name}</strong>
                      <small>{instructor.status}</small>
                    </td>
                    <td>
                      <span>{instructor.whatsapp}</span>
                      <small>{instructor.email}</small>
                    </td>
                    <td>{instructor.maxLoad}</td>
                    <td>{instructor.unmarked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function StudentManagement({
  students,
  instructors,
  lessons,
  questions,
  submissions,
  onAssignStudent,
  onDeleteAccount,
  onNotify,
}) {
  const [query, setQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [mapMode, setMapMode] = useState("selected");

  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.serial} ${student.username} ${student.denomination}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? students[0];
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const submittedLessons = lessons
    .map((lesson) => ({
      lesson,
      submissions: submissions
        .filter((submission) =>
          submission.studentId === selectedStudent?.id &&
          submission.status !== "draft" &&
          questionsById.get(submission.questionId)?.lesson === lesson.number,
        )
        .sort(
          (first, second) =>
            (questionsById.get(first.questionId)?.order ?? 0) -
            (questionsById.get(second.questionId)?.order ?? 0),
        ),
    }))
    .filter(({ submissions: lessonSubmissions }) => lessonSubmissions.length > 0);

  async function assignInstructor(studentId, instructorId) {
    try {
      await onAssignStudent(studentId, instructorId);
      onNotify("Student assignment updated.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function deleteStudent(student) {
    const confirmed = window.confirm(
      `Permanently delete ${student.name}'s student record, account, registration details, and learning data? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await onDeleteAccount({ kind: "student", id: student.id });
      onNotify(`${student.name}'s account and details were permanently deleted.`);
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  const mapCenter = selectedStudent?.location ?? {
    city: "Kaduna",
    lat: 10.5105,
    lng: 7.4165,
  };
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
    mapCenter.lng - 0.08
  }%2C${mapCenter.lat - 0.06}%2C${mapCenter.lng + 0.08}%2C${
    mapCenter.lat + 0.06
  }&layer=mapnik&marker=${mapCenter.lat}%2C${mapCenter.lng}`;

  return (
    <>
      <PageHeading
        eyebrow="Student management"
        title="Assign, monitor, and locate students"
        description="Manage instructor assignments and review each student's study progress and location."
      />
      <section className="admin-panel">
        <div className="admin-toolbar">
          <input
            className="admin-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, serial, or denomination"
            aria-label="Search students"
          />
          <StatusBadge tone="blue">{filteredStudents.length} students</StatusBadge>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--interactive">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Instructor assignment</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr
                  className={selectedStudentId === student.id ? "is-selected" : ""}
                  key={student.id}
                >
                  <td>
                    <button
                      className="admin-text-button"
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                      <strong>{student.name}</strong>
                      <small>{student.serial}</small>
                    </button>
                  </td>
                  <td>
                    <StatusBadge
                      tone={student.status === "Active" ? "green" : "neutral"}
                    >
                      {student.status}
                    </StatusBadge>
                    <small className="admin-cell-note">{student.milestone}</small>
                  </td>
                  <td>
                    <div className="admin-progress">
                      <span style={{ width: `${student.progress}%` }} />
                    </div>
                    <small>
                      {student.progress}% · Lesson {student.currentLesson}/26
                    </small>
                  </td>
                  <td>
                    <label className="admin-select-wrap">
                      <span className="sr-only">Assign {student.name}</span>
                      <select
                        value={student.instructorId ?? ""}
                        onChange={(event) =>
                          assignInstructor(student.id, event.target.value)
                        }
                      >
                        <option value="">Awaiting assignment</option>
                        {instructors
                          .filter(
                            (instructor) =>
                              instructor.status === "Active" &&
                              instructor.approval === "Approved",
                          )
                          .map((instructor) => (
                            <option key={instructor.id} value={instructor.id}>
                              {instructor.name}
                            </option>
                          ))}
                      </select>
                      <CaretDown aria-hidden="true" size={16} />
                    </label>
                  </td>
                  <td>
                    <button
                      className="admin-location-button"
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(student.id);
                        setMapMode("selected");
                      }}
                    >
                      <MapPin aria-hidden="true" size={18} />
                      {student.location.city}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-two-column admin-two-column--student">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>{selectedStudent?.name ?? "Student progress"}</h3>
              <p>{selectedStudent?.serial}</p>
            </div>
            <StatusBadge tone="green">{selectedStudent?.progress ?? 0}%</StatusBadge>
          </div>
          {selectedStudent && (
            <div className="admin-student-profile">
              <dl>
                <div>
                  <dt>Username</dt>
                  <dd>{selectedStudent.username || "Not assigned yet"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{selectedStudent.email || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{selectedStudent.phone || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{selectedStudent.address}</dd>
                </div>
                <div>
                  <dt>Denomination</dt>
                  <dd>{selectedStudent.denomination}</dd>
                </div>
                <div>
                  <dt>Current lesson</dt>
                  <dd>{selectedStudent.currentLesson} of 26</dd>
                </div>
                <div>
                  <dt>Milestone</dt>
                  <dd>{selectedStudent.milestone}</dd>
                </div>
                <div>
                  <dt>Joined</dt>
                  <dd>{selectedStudent.joined}</dd>
                </div>
                <div>
                  <dt>Last dashboard activity</dt>
                  <dd>{selectedStudent.lastActivity || "No activity recorded"}</dd>
                </div>
                {Object.entries(selectedStudent.registrationData ?? {})
                  .filter(([key]) => !["full_name", "email", "username", "password", "phone", "address", "denomination", "is_adventist"].includes(key))
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value || "Not provided")}</dd>
                    </div>
                  ))}
              </dl>
              <div className="admin-progress admin-progress--large">
                <span style={{ width: `${selectedStudent.progress}%` }} />
              </div>
              <button
                className="admin-danger-button"
                type="button"
                onClick={() => deleteStudent(selectedStudent)}
              >
                <Trash aria-hidden="true" size={17} />
                Permanently delete student
              </button>
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Student locations</h3>
              <p>
                {mapMode === "selected"
                  ? `Showing ${selectedStudent?.name ?? "selected student"}`
                  : `Showing all ${students.length} student locations`}
              </p>
            </div>
            <div className="admin-segmented">
              <button
                className={mapMode === "selected" ? "is-active" : ""}
                type="button"
                onClick={() => setMapMode("selected")}
              >
                Selected
              </button>
              <button
                className={mapMode === "all" ? "is-active" : ""}
                type="button"
                onClick={() => setMapMode("all")}
              >
                All
              </button>
            </div>
          </div>
          {mapMode === "selected" ? (
            <iframe
              className="admin-map"
              title={`Map showing ${selectedStudent?.name ?? "student"}`}
              src={mapUrl}
              loading="lazy"
            />
          ) : (
            <div className="admin-location-list">
              {students.map((student) => (
                <button
                  type="button"
                  key={student.id}
                  onClick={() => {
                    setSelectedStudentId(student.id);
                    setMapMode("selected");
                  }}
                >
                  <MapPin aria-hidden="true" size={18} />
                  <span>
                    <strong>{student.name}</strong>
                    <small>{student.location.city}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="admin-panel admin-lesson-answers">
        <div className="admin-panel-heading">
          <div>
            <h3>Submitted lesson answers</h3>
            <p>Download each submitted lesson as a Microsoft Word document.</p>
          </div>
          <StatusBadge tone="blue">{submittedLessons.length} lessons</StatusBadge>
        </div>
        {selectedStudent && submittedLessons.length ? (
          <div className="admin-lesson-answer-downloads">
            {submittedLessons.map(({ lesson, submissions: lessonSubmissions }) => (
              <article key={lesson.id}>
                <div>
                  <strong>Lesson {lesson.number}: {lesson.title}</strong>
                  <small>{lessonSubmissions.length} submitted answer{lessonSubmissions.length === 1 ? "" : "s"}</small>
                </div>
                <button
                  className="admin-secondary-button"
                  type="button"
                  onClick={() => exportLessonAnswersWord({ student: selectedStudent, lesson, submissions: lessonSubmissions, questions })}
                >
                  <DownloadSimple aria-hidden="true" size={18} />
                  Download Word
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState>This student has not submitted any lesson answers yet.</EmptyState>
        )}
      </section>
    </>
  );
}

function InstructorManagement({
  instructors,
  students,
  messages,
  adminProfileId,
  onApproveInstructor,
  onSendMessage,
  onUpdateInstructor,
  onDeleteAccount,
  onNotify,
}) {
  const [capacityById, setCapacityById] = useState(() =>
    Object.fromEntries(
      instructors.map((instructor) => [instructor.id, instructor.maxLoad]),
    ),
  );
  const approvedInstructors = instructors.filter(
    (instructor) => instructor.approval === "Approved" && instructor.profileId,
  );
  const [selectedThreadInstructorId, setSelectedThreadInstructorId] = useState(
    approvedInstructors[0]?.id ?? "",
  );
  const [messageDraft, setMessageDraft] = useState("");
  const [threadNotice, setThreadNotice] = useState(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const studentLoad = (instructorId) =>
    countWhere(students, (student) => student.instructorId === instructorId);
  const selectedThreadInstructor =
    approvedInstructors.find((instructor) => instructor.id === selectedThreadInstructorId) ??
    approvedInstructors[0] ??
    null;
  const instructorMessages = messages.filter(
    (threadMessage) => threadMessage.instructor_id === selectedThreadInstructor?.id,
  );

  useEffect(() => {
    if (!selectedThreadInstructorId && approvedInstructors[0]?.id) {
      setSelectedThreadInstructorId(approvedInstructors[0].id);
    }
  }, [approvedInstructors, selectedThreadInstructorId]);

  async function updateInstructor(instructorId, changes, message) {
    try {
      await onUpdateInstructor(instructorId, changes);
      onNotify(message);
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function approveApplication(instructor) {
    try {
      await onApproveInstructor(
        instructor,
        Number(capacityById[instructor.id] ?? 10),
      );
      onNotify(`${instructor.name} approved as an instructor.`);
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function deleteInstructor(instructor) {
    const confirmed = window.confirm(
      `Permanently delete ${instructor.name}'s instructor registration, account, and stored details? This cannot be undone. Assigned students will become unassigned.`,
    );
    if (!confirmed) return;

    const target = instructor.registrationId
      ? { kind: "volunteer_registration", id: instructor.registrationId }
      : instructor.applicationId
        ? { kind: "instructor_application", id: instructor.applicationId }
        : { kind: "instructor", id: instructor.id };
    try {
      await onDeleteAccount(target);
      onNotify(`${instructor.name}'s account and details were permanently deleted.`);
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function sendInstructorMessage(event) {
    event.preventDefault();
    if (!selectedThreadInstructor) return;
    setThreadNotice(null);
    setIsSendingMessage(true);
    try {
      await onSendMessage(selectedThreadInstructor.id, messageDraft);
      setMessageDraft("");
      setThreadNotice({
        tone: "success",
        text: `Message sent to ${selectedThreadInstructor.name}.`,
      });
    } catch (error) {
      setThreadNotice({
        tone: "error",
        text: readableError(error),
      });
    } finally {
      setIsSendingMessage(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Instructor management"
        title="Approve and manage volunteer instructors"
        description="Review applications, set student capacity, monitor workload, and deactivate accounts."
      />

      <section className="admin-panel">
        <div className="admin-card-list">
          {instructors.map((instructor) => {
            const assigned = studentLoad(instructor.id);
            return (
              <article className="admin-instructor-card" key={instructor.id}>
                <div className="admin-avatar">
                  <UserCircle aria-hidden="true" size={34} weight="duotone" />
                </div>
                <div className="admin-instructor-main">
                  <div className="admin-instructor-title">
                    <div>
                      <h3>{instructor.name}</h3>
                      {instructor.username && <p>Username: {instructor.username}</p>}
                      <p>{instructor.email}</p>
                      <p>{instructor.whatsapp}</p>
                      {instructor.address && <p>{instructor.address}</p>}
                      {instructor.lastActivity && <p>Last active: {instructor.lastActivity}</p>}
                    </div>
                    <StatusBadge
                      tone={
                        instructor.approval === "Approved"
                          ? instructor.status === "Active"
                            ? "green"
                            : "neutral"
                          : "gold"
                      }
                    >
                      {instructor.approval === "Approved"
                        ? instructor.status
                        : instructor.approval}
                    </StatusBadge>
                  </div>
                  <div className="admin-instructor-stats">
                    <span>
                      <strong>{assigned}</strong> assigned students
                    </span>
                    <span>
                      <strong>{instructor.unmarked}</strong> unmarked
                    </span>
                    <span>
                      <strong>{instructor.graduationRequests}</strong> graduation
                      requests
                    </span>
                  </div>
                  <div className="admin-instructor-actions">
                    <label>
                      Maximum student load
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={capacityById[instructor.id] ?? instructor.maxLoad}
                        onChange={(event) =>
                          setCapacityById((current) => ({
                            ...current,
                            [instructor.id]: event.target.value,
                          }))
                        }
                        onBlur={() =>
                          instructor.approval === "Approved" &&
                          updateInstructor(
                            instructor.id,
                            {
                              maxLoad: Number(
                                capacityById[instructor.id] ??
                                  instructor.maxLoad,
                              ),
                            },
                            "Instructor capacity updated.",
                          )
                        }
                      />
                    </label>
                    {instructor.approval !== "Approved" ? (
                      <button
                        className="admin-primary-button"
                        type="button"
                        onClick={() => approveApplication(instructor)}
                      >
                        <UserCheck aria-hidden="true" size={19} />
                        Approve registration
                      </button>
                    ) : (
                      <button
                        className="admin-secondary-button"
                        type="button"
                        onClick={() =>
                          updateInstructor(
                            instructor.id,
                            {
                              status:
                                instructor.status === "Active" ? "Inactive" : "Active",
                            },
                            `Instructor account ${
                              instructor.status === "Active"
                                ? "deactivated"
                                : "reactivated"
                            }.`,
                          )
                        }
                      >
                        {instructor.status === "Active" ? (
                          <UserMinus aria-hidden="true" size={19} />
                        ) : (
                          <UserCheck aria-hidden="true" size={19} />
                        )}
                        {instructor.status === "Active"
                          ? "Deactivate"
                          : "Reactivate"}
                      </button>
                    )}
                    <button
                      className="admin-danger-button"
                      type="button"
                      onClick={() => deleteInstructor(instructor)}
                    >
                      <Trash aria-hidden="true" size={17} />
                      Permanently delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="admin-two-column admin-two-column--messages">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Instructor conversations</h3>
              <p>Choose an approved volunteer instructor to open the admin support thread.</p>
            </div>
          </div>
          {approvedInstructors.length === 0 ? (
            <EmptyState>No approved volunteer instructors are available for messaging yet.</EmptyState>
          ) : (
            <div className="admin-message-list">
              {approvedInstructors.map((instructor) => (
                <button
                  className={
                    selectedThreadInstructor?.id === instructor.id
                      ? "admin-message-list__item is-active"
                      : "admin-message-list__item"
                  }
                  type="button"
                  key={instructor.id}
                  onClick={() => setSelectedThreadInstructorId(instructor.id)}
                >
                  <span>
                    <strong>{instructor.name}</strong>
                    <small>{instructor.email}</small>
                  </span>
                  <StatusBadge tone={instructor.status === "Active" ? "green" : "neutral"}>
                    {instructor.status}
                  </StatusBadge>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-panel admin-message-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-message-eyebrow">Volunteer instructor</p>
              <h3>{selectedThreadInstructor?.name ?? "Administrator thread"}</h3>
              <p>
                {selectedThreadInstructor
                  ? "Bidirectional support between administration and volunteer instructors."
                  : "Select an approved instructor to begin."}
              </p>
            </div>
          </div>
          {!selectedThreadInstructor ? (
            <EmptyState>The selected message thread will appear here.</EmptyState>
          ) : (
            <>
              <div className="admin-message-thread" role="log" aria-label={`Messages with ${selectedThreadInstructor.name}`}>
                {instructorMessages.length === 0 ? (
                  <div className="admin-message-empty">
                    <span><PaperPlaneTilt aria-hidden="true" size={22} weight="duotone" /></span>
                    <div>
                      <strong>Start the conversation</strong>
                      <p>No messages yet in this instructor thread. Share an update, answer a question, or offer support below.</p>
                    </div>
                  </div>
                ) : instructorMessages.map((threadMessage) => {
                  const isOwnMessage = threadMessage.sender_profile_id === adminProfileId;
                  return (
                    <article
                      className={
                        isOwnMessage
                          ? "admin-message-card admin-message-card--own"
                          : "admin-message-card"
                      }
                      key={threadMessage.id}
                    >
                      <strong>{isOwnMessage ? "You" : selectedThreadInstructor.name}</strong>
                      <p>{threadMessage.body}</p>
                      <small>{formatMessageTime(threadMessage.created_at)}</small>
                    </article>
                  );
                })}
              </div>
              <form className="admin-message-form" onSubmit={sendInstructorMessage}>
                <div className="admin-message-compose-heading">
                  <div>
                    <p>New message</p>
                    <span>Your reply is shared privately with this volunteer instructor.</span>
                  </div>
                </div>
                <label className="admin-message-field">
                  <span>Message</span>
                  <textarea
                    rows="4"
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder="Share a decision, answer a question, or encourage the instructor."
                    required
                  />
                </label>
                {threadNotice && (
                  <div
                    className={
                      threadNotice.tone === "error"
                        ? "admin-form-error"
                        : "admin-form-notice"
                    }
                  >
                    {threadNotice.text}
                  </div>
                )}
                <button className="admin-primary-button" type="submit" disabled={isSendingMessage}>
                  <PaperPlaneTilt aria-hidden="true" size={18} />
                  {isSendingMessage ? "Sending..." : "Send message"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function LessonManagement({ lessons, onUploadLesson, onNotify }) {
  async function uploadLesson(lessonNumber, file) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      onNotify("Only PDF lesson files are accepted.", "error");
      return;
    }
    try {
      await onUploadLesson(lessonNumber, file);
      onNotify("Lesson PDF uploaded securely.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Lesson management"
        title="Upload the 26 study lessons"
        description="Manage administrator-only PDF lesson files. Student-facing lesson access must use a protected viewer rather than direct downloads."
        action={
          <StatusBadge tone="blue">
            {countWhere(lessons, (lesson) => lesson.status === "Uploaded")}/26
            uploaded
          </StatusBadge>
        }
      />
      <aside className="admin-policy-note">
        <FilePdf aria-hidden="true" size={24} />
        <p>
          <strong>Protected lesson policy:</strong> uploaded PDFs are recorded in
          the administration area only. Production storage should use signed,
          expiring viewer links and disable student download controls.
        </p>
      </aside>
      <section className="admin-lesson-grid">
        {lessons.map((lesson) => (
          <article className="admin-lesson-card" key={lesson.id}>
            <div className="admin-lesson-number">{lesson.number}</div>
            <div>
              <h3>{lesson.title}</h3>
              <p>
                {lesson.fileName || "No PDF uploaded"}
                {lesson.uploadedAt ? ` · ${lesson.uploadedAt}` : ""}
              </p>
            </div>
            <StatusBadge tone={lesson.status === "Uploaded" ? "green" : "neutral"}>
              {lesson.status}
            </StatusBadge>
            <label className="admin-upload-button">
              <UploadSimple aria-hidden="true" size={18} />
              {lesson.status === "Uploaded" ? "Replace PDF" : "Upload PDF"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  uploadLesson(lesson.number, event.target.files?.[0])
                }
              />
            </label>
          </article>
        ))}
      </section>
    </>
  );
}

function QuestionManagement({
  questions,
  instructors,
  onAddQuestion,
  onUpdateQuestionType,
  onMoveQuestion,
  onDeleteQuestion,
  onNotify,
}) {
  const [lesson, setLesson] = useState(1);
  const [type, setType] = useState("Multiple choice");
  const [marker, setMarker] = useState("");
  const [prompt, setPrompt] = useState("");
  const [editedTypes, setEditedTypes] = useState({});

  const lessonQuestions = questions
    .filter((question) => question.lesson === Number(lesson))
    .sort((a, b) => a.order - b.order);

  async function addQuestion(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    try {
      await onAddQuestion({
        lesson: Number(lesson),
        order: lessonQuestions.length + 1,
        type,
        markerId: marker || null,
        prompt: prompt.trim(),
      });
      setPrompt("");
      onNotify("Question added to the lesson.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function moveQuestion(questionId, direction) {
    const currentIndex = lessonQuestions.findIndex(
      (question) => question.id === questionId,
    );
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= lessonQuestions.length) return;
    try {
      await onMoveQuestion(questionId, direction);
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function saveQuestionType(question) {
    const nextType = editedTypes[question.id] ?? question.type;
    if (nextType === question.type) return;

    try {
      await onUpdateQuestionType(question.id, nextType);
      setEditedTypes((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      onNotify("Question type updated.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function removeQuestion(questionId) {
    try {
      await onDeleteQuestion(questionId);
      onNotify("Question removed.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Question management"
        title="Build and arrange lesson questions"
        description="Choose the question type, assign a marker, and control the order for each lesson."
      />
      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Add a question</h3>
              <p>New questions are saved to the selected lesson.</p>
            </div>
          </div>
          <form className="admin-form-grid" onSubmit={addQuestion}>
            <label>
              Lesson
              <select value={lesson} onChange={(event) => setLesson(event.target.value)}>
                {Array.from({ length: 26 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Lesson {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Question type
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option>Multiple choice</option>
                <option>True or false</option>
                <option>Short answer</option>
                <option>Essay</option>
              </select>
            </label>
            <label>
              Marker
              <select
                value={marker}
                onChange={(event) => setMarker(event.target.value)}
              >
                <option value="">Auto-mark</option>
                {instructors
                  .filter(
                    (instructor) =>
                      instructor.status === "Active" &&
                      instructor.approval === "Approved",
                  )
                  .map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="admin-form-grid__wide">
              Question
              <textarea
                rows="5"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Enter the lesson question"
                required
              />
            </label>
            <button className="admin-primary-button" type="submit">
              <Plus aria-hidden="true" size={19} />
              Add question
            </button>
          </form>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Lesson {lesson} question order</h3>
              <p>{lessonQuestions.length} questions configured.</p>
            </div>
          </div>
          {lessonQuestions.length ? (
            <ol className="admin-question-list">
              {lessonQuestions.map((question, index) => (
                <li key={question.id}>
                  <span className="admin-question-order">{index + 1}</span>
                  <div className="admin-question-summary">
                    <strong>{question.prompt}</strong>
                    <small>
                      {question.type} · {question.marker}
                    </small>
                  </div>
                  <div className="admin-question-controls">
                    <label className="admin-question-type-editor">
                      <span className="sr-only">Question {index + 1} type</span>
                      <select
                        value={editedTypes[question.id] ?? question.type}
                        onChange={(event) =>
                          setEditedTypes((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      >
                        <option>Multiple choice</option>
                        <option>True or false</option>
                        <option>Short answer</option>
                        <option>Essay</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => saveQuestionType(question)}
                      disabled={(editedTypes[question.id] ?? question.type) === question.type}
                      aria-label={`Save type for question ${index + 1}`}
                      title="Save question type"
                    >
                      <FloppyDisk aria-hidden="true" size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(question.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move question ${index + 1} up`}
                    >
                      <ArrowUp aria-hidden="true" size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(question.id, 1)}
                      disabled={index === lessonQuestions.length - 1}
                      aria-label={`Move question ${index + 1} down`}
                    >
                      <ArrowDown aria-hidden="true" size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      aria-label={`Delete question ${index + 1}`}
                    >
                      <X aria-hidden="true" size={17} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState>No questions have been added to this lesson.</EmptyState>
          )}
        </section>
      </div>
    </>
  );
}

function CertificateManagement({
  certificates,
  students,
  onIssueCertificate,
  onUploadCertificatePdf,
  onNotify,
}) {
  const eligibleStudents = students.filter(
    (student) =>
      student.milestone === "Graduated" ||
      student.milestone === "Awaiting Graduation" ||
      student.progress === 100,
  );
  const [studentId, setStudentId] = useState(eligibleStudents[0]?.id ?? "");
  const [verificationCode, setVerificationCode] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const selectedStudent = students.find((student) => student.id === studentId);
  const selectedCertificate = certificates.find(
    (certificate) => certificate.studentId === studentId,
  );

  async function generateCertificate() {
    if (!studentId) return;
    try {
      const certificate = await onIssueCertificate(studentId);
      setVerificationCode(
        certificate?.verification_code ?? certificate?.code ?? "",
      );
      onNotify("Digital certificate generated.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function uploadCertificatePdf() {
    if (!studentId || !certificateFile) return;
    setIsUploading(true);
    try {
      const certificate = await onUploadCertificatePdf(studentId, certificateFile);
      setVerificationCode(
        certificate?.verification_code ??
          certificate?.code ??
          selectedCertificate?.code ??
          "",
      );
      setCertificateFile(null);
      onNotify("Certificate PDF uploaded.");
    } catch (error) {
      onNotify(readableError(error), "error");
    } finally {
      setIsUploading(false);
    }
  }

  const verifiedCertificate = certificates.find(
    (certificate) =>
      certificate.code.toLowerCase() === verificationCode.trim().toLowerCase(),
  );

  return (
    <>
      <PageHeading
        eyebrow="Certificates"
        title="Generate and verify digital certificates"
        description="Issue traceable completion certificates and confirm certificate authenticity."
      />
      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Generate certificate</h3>
              <p>Select an eligible student, issue a verification code, and upload the graduation PDF.</p>
            </div>
          </div>
          <div className="admin-certificate-generator">
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              {eligibleStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.serial}
                </option>
              ))}
            </select>
            <button
              className="admin-primary-button"
              type="button"
              onClick={generateCertificate}
            >
              <Certificate aria-hidden="true" size={20} />
              Generate digital certificate
            </button>
            <label className="admin-file-field">
              Graduation certificate PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) =>
                  setCertificateFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <button
              className="admin-secondary-button"
              type="button"
              onClick={uploadCertificatePdf}
              disabled={!certificateFile || isUploading}
            >
              <UploadSimple aria-hidden="true" size={19} />
              {isUploading ? "Uploading..." : "Upload certificate PDF"}
            </button>
            <small className="admin-maintenance-note">
              {selectedCertificate?.fileName
                ? `Current PDF: ${selectedCertificate.fileName}`
                : "No certificate PDF has been uploaded for this student yet."}
            </small>
          </div>
          {verificationCode && (
            <div className="admin-certificate-preview">
              <img src="/dbs-kaduna-logo.png?v=20260614" alt="" />
              <p>Discover Bible School, Kaduna</p>
              <h3>Certificate of Completion</h3>
              <span>This certifies that</span>
              <strong>{selectedStudent?.name}</strong>
              <small>Verification: {verificationCode}</small>
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Certificate verification</h3>
              <p>Enter a code to validate an issued certificate.</p>
            </div>
          </div>
          <label className="admin-verification-field">
            Verification code
            <input
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="DBS-KD-CERT-26001"
            />
          </label>
          {verificationCode.trim() &&
            (verifiedCertificate ? (
              <div className="admin-verification-result is-valid">
                <CheckCircle aria-hidden="true" size={30} weight="fill" />
                <div>
                  <strong>Certificate verified</strong>
                  <p>
                    {
                      students.find(
                        (student) =>
                          student.id === verifiedCertificate.studentId,
                      )?.name
                    }{" "}
                    · issued {verifiedCertificate.issuedAt}
                  </p>
                </div>
              </div>
            ) : (
              <div className="admin-verification-result is-invalid">
                <X aria-hidden="true" size={28} weight="bold" />
                <div>
                  <strong>Code not found</strong>
                  <p>Check the certificate code and try again.</p>
                </div>
              </div>
            ))}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Certificate</th>
                  <th>Student</th>
                  <th>Issued</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((certificate) => (
                  <tr key={certificate.id}>
                    <td>{certificate.code}</td>
                    <td>
                      {
                        students.find(
                          (student) => student.id === certificate.studentId,
                        )?.name
                      }
                    </td>
                    <td>{certificate.issuedAt}</td>
                    <td>{certificate.fileName || "Awaiting upload"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Reports({ students, instructors, certificates, onNotify }) {
  const studentRows = students.map((student) => ({
    serial: student.serial,
    name: student.name,
    denomination: student.denomination,
    status: student.status,
    milestone: student.milestone,
    progress: `${student.progress}%`,
    currentLesson: student.currentLesson,
    location: student.location.city,
  }));
  const workloadRows = instructors.map((instructor) => ({
    name: instructor.name,
    email: instructor.email,
    whatsapp: instructor.whatsapp,
    status: instructor.status,
    maxLoad: instructor.maxLoad,
    assigned: countWhere(
      students,
      (student) => student.instructorId === instructor.id,
    ),
    unmarked: instructor.unmarked,
    graduationRequests: instructor.graduationRequests,
  }));
  const progressRows = students.map((student) => ({
    serial: student.serial,
    name: student.name,
    progress: `${student.progress}%`,
    lesson: `${student.currentLesson}/26`,
    milestone: student.milestone,
  }));
  const certificateRows = certificates.map((certificate) => ({
    code: certificate.code,
    student:
      students.find((student) => student.id === certificate.studentId)?.name ??
      "Unknown",
    issuedAt: certificate.issuedAt,
    status: certificate.status,
  }));

  const reportCards = [
    {
      title: "Student records",
      description: "Full student register with denomination and study status.",
      rows: studentRows,
      columns: [
        { key: "serial", label: "Serial" },
        { key: "name", label: "Student" },
        { key: "denomination", label: "Denomination" },
        { key: "status", label: "Status" },
        { key: "milestone", label: "Milestone" },
        { key: "progress", label: "Progress" },
        { key: "currentLesson", label: "Current lesson" },
        { key: "location", label: "Location" },
      ],
      fileName: "dbs-student-records",
    },
    {
      title: "Instructor workload",
      description: "Assigned load, capacity, marking, and graduation requests.",
      rows: workloadRows,
      columns: [
        { key: "name", label: "Instructor" },
        { key: "email", label: "Email" },
        { key: "whatsapp", label: "WhatsApp" },
        { key: "status", label: "Status" },
        { key: "maxLoad", label: "Maximum load" },
        { key: "assigned", label: "Assigned students" },
        { key: "unmarked", label: "Unmarked submissions" },
        { key: "graduationRequests", label: "Graduation requests" },
      ],
      fileName: "dbs-instructor-workload",
    },
    {
      title: "Progress report",
      description: "Current lesson, percentage, and milestone for every student.",
      rows: progressRows,
      columns: [
        { key: "serial", label: "Serial" },
        { key: "name", label: "Student" },
        { key: "progress", label: "Progress" },
        { key: "lesson", label: "Lesson" },
        { key: "milestone", label: "Milestone" },
      ],
      fileName: "dbs-progress-report",
    },
    {
      title: "Certificate report",
      description: "Issued certificates and verification status.",
      rows: certificateRows,
      columns: [
        { key: "code", label: "Certificate code" },
        { key: "student", label: "Student" },
        { key: "issuedAt", label: "Issued" },
        { key: "status", label: "Status" },
      ],
      fileName: "dbs-certificate-report",
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="Reports"
        title="Export operational reports to Excel"
        description="Download student, instructor, progress, and certificate records in an Excel-compatible workbook."
      />
      <section className="admin-report-grid">
        {reportCards.map((report) => (
          <article className="admin-report-card" key={report.title}>
            <span>
              <ChartBar aria-hidden="true" size={27} weight="duotone" />
            </span>
            <h3>{report.title}</h3>
            <p>{report.description}</p>
            <small>{report.rows.length} rows ready</small>
            <button
              className="admin-primary-button"
              type="button"
              onClick={() => {
                exportExcelFile(
                  report.fileName,
                  report.title,
                  report.columns,
                  report.rows,
                );
                onNotify(`${report.title} exported.`);
              }}
            >
              <DownloadSimple aria-hidden="true" size={19} />
              Export to Excel
            </button>
          </article>
        ))}
      </section>
    </>
  );
}

function recruitmentKindLabel(kind) {
  return kind === "student" ? "Student" : "Volunteer instructor";
}

function RecruitmentManagement({
  campaigns,
  enrolments,
  onCreateCampaign,
  onDeleteCampaign,
  onNotify,
}) {
  const [campaignName, setCampaignName] = useState("");
  const [recruitmentKind, setRecruitmentKind] = useState("student");
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    campaigns[0]?.id ?? "",
  );
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (
      campaigns.length > 0 &&
      !campaigns.some((campaign) => campaign.id === selectedCampaignId)
    ) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
    campaigns[0];
  const selectedEnrolments = selectedCampaign
    ? enrolments.filter((item) => item.campaignId === selectedCampaign.id)
    : [];
  const campaignPath = selectedCampaign
    ? selectedCampaign.recruitmentKind === "student"
      ? "/register/student"
      : "/register/volunteer-instructor"
    : "";
  const campaignUrl = selectedCampaign
    ? `${window.location.origin}${campaignPath}?campaign=${encodeURIComponent(
        selectedCampaign.slug,
      )}`
    : "";

  useEffect(() => {
    let cancelled = false;
    if (!campaignUrl) {
      setQrDataUrl("");
      return undefined;
    }

    QRCode.toDataURL(campaignUrl, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#071c45", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        if (!cancelled) onNotify(readableError(error), "error");
      });

    return () => {
      cancelled = true;
    };
  }, [campaignUrl, onNotify]);

  async function createCampaign(event) {
    event.preventDefault();
    setIsCreating(true);
    try {
      const created = await onCreateCampaign({
        name: campaignName.trim(),
        recruitmentKind,
      });
      setCampaignName("");
      setSelectedCampaignId(created.id);
      onNotify("Recruitment campaign and QR code created.");
    } catch (error) {
      onNotify(readableError(error), "error");
    } finally {
      setIsCreating(false);
    }
  }

  async function copyCampaignLink() {
    try {
      await navigator.clipboard.writeText(campaignUrl);
      onNotify("Campaign link copied.");
    } catch {
      onNotify("The campaign link could not be copied automatically.", "error");
    }
  }

  function downloadQrCode() {
    if (!selectedCampaign || !qrDataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `${selectedCampaign.slug}-qr-code.png`;
    anchor.click();
    onNotify("QR code downloaded.");
  }

  async function deleteCampaign() {
    if (!selectedCampaign) return;
    if (!window.confirm(`Delete the campaign “${selectedCampaign.name}”?`)) return;
    try {
      await onDeleteCampaign(selectedCampaign.id);
      setSelectedCampaignId("");
      onNotify("QR campaign deleted.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Recruitment"
        title="QR recruitment campaigns"
        description="Create trackable QR codes for student and volunteer instructor recruitment, then review every enrolment from each effort."
      />

      <div className="admin-recruitment-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Create campaign</h3>
              <p>Each campaign gets a unique registration link and QR code.</p>
            </div>
          </div>
          <form className="admin-form-grid" onSubmit={createCampaign}>
            <label className="admin-form-grid__wide">
              Campaign name
              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="e.g. Kaduna Central July Outreach"
                minLength="2"
                required
              />
            </label>
            <label className="admin-form-grid__wide">
              Recruitment type
              <select
                value={recruitmentKind}
                onChange={(event) => setRecruitmentKind(event.target.value)}
              >
                <option value="student">Student recruitment</option>
                <option value="volunteer_instructor">
                  Volunteer instructor recruitment
                </option>
              </select>
            </label>
            <button
              className="admin-primary-button"
              type="submit"
              disabled={isCreating}
            >
              <QrCode aria-hidden="true" size={20} />
              {isCreating ? "Generating..." : "Generate QR code"}
            </button>
          </form>

          <div className="admin-campaign-list">
            <div className="admin-panel-heading">
              <div>
                <h3>Campaigns</h3>
                <p>{campaigns.length} trackable recruitment efforts.</p>
              </div>
            </div>
            {campaigns.length === 0 ? (
              <EmptyState>Create the first campaign to generate a QR code.</EmptyState>
            ) : (
              campaigns.map((campaign) => (
                <button
                  className={campaign.id === selectedCampaign?.id ? "is-active" : ""}
                  type="button"
                  key={campaign.id}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                >
                  <span>
                    <strong>{campaign.name}</strong>
                    <small>
                      {recruitmentKindLabel(campaign.recruitmentKind)} ·{" "}
                      {campaign.createdAt}
                    </small>
                  </span>
                  <StatusBadge tone={campaign.enrolmentCount > 0 ? "green" : "blue"}>
                    {campaign.enrolmentCount} enrolled
                  </StatusBadge>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel admin-qr-preview">
          <div className="admin-panel-heading">
            <div>
              <h3>Campaign QR code</h3>
              <p>Share digitally or download for posters and printed materials.</p>
            </div>
          </div>
          {selectedCampaign ? (
            <>
              <div className="admin-qr-card">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${selectedCampaign.name}`}
                  />
                ) : (
                  <div className="admin-qr-loading">Generating QR code...</div>
                )}
                <strong>{selectedCampaign.name}</strong>
                <span>{recruitmentKindLabel(selectedCampaign.recruitmentKind)}</span>
              </div>
              <label className="admin-campaign-link">
                Registration link
                <input value={campaignUrl} readOnly onFocus={(event) => event.target.select()} />
              </label>
              <div className="admin-qr-actions">
                <button
                  className="admin-secondary-button"
                  type="button"
                  onClick={copyCampaignLink}
                >
                  <Copy aria-hidden="true" size={18} />
                  Copy link
                </button>
                <button
                  className="admin-primary-button"
                  type="button"
                  onClick={downloadQrCode}
                  disabled={!qrDataUrl}
                >
                  <DownloadSimple aria-hidden="true" size={18} />
                  Download QR
                </button>
                <button
                  className="admin-danger-button"
                  type="button"
                  onClick={deleteCampaign}
                >
                  <Trash aria-hidden="true" size={18} />
                  Delete campaign
                </button>
              </div>
            </>
          ) : (
            <EmptyState>Select or create a campaign to preview its QR code.</EmptyState>
          )}
        </section>
      </div>

      <section className="admin-panel admin-recruitment-enrolments">
        <div className="admin-panel-heading">
          <div>
            <h3>Campaign enrolments</h3>
            <p>
              {selectedCampaign
                ? `${selectedEnrolments.length} people enrolled through ${selectedCampaign.name}.`
                : "Select a campaign to see the people who enrolled through it."}
            </p>
          </div>
          {selectedCampaign && selectedEnrolments.length > 0 && (
            <button
              className="admin-secondary-button"
              type="button"
              onClick={() => {
                exportExcelFile(
                  `${selectedCampaign.slug}-enrolments`,
                  `${selectedCampaign.name} enrolments`,
                  [
                    { key: "name", label: "Name" },
                    { key: "phone", label: "Phone number" },
                    { key: "address", label: "Address" },
                    { key: "submittedAt", label: "Date enrolled" },
                  ],
                  selectedEnrolments,
                );
                onNotify("Campaign enrolments exported.");
              }}
            >
              <DownloadSimple aria-hidden="true" size={18} />
              Export enrolments
            </button>
          )}
        </div>
        {selectedEnrolments.length === 0 ? (
          <EmptyState>No enrolments have been received through this campaign yet.</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone number</th>
                  <th>Address</th>
                  <th>Date enrolled</th>
                </tr>
              </thead>
              <tbody>
                {selectedEnrolments.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.phone}</td>
                    <td>{item.address}</td>
                    <td>{item.submittedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RegistrationFormManagement({
  forms,
  onSaveForm,
  onClearRegistrationData,
  onNotify,
}) {
  const [selectedKind, setSelectedKind] = useState("student");
  const selectedForm = forms.find((form) => form.recruitmentKind === selectedKind);
  const [draft, setDraft] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    setDraft(selectedForm ? structuredClone(selectedForm) : null);
  }, [selectedForm]);

  function updateDraft(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function updateField(index, changes) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      ),
    }));
  }

  function addField() {
    setDraft((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          key: `custom_${crypto.randomUUID().slice(0, 8)}`,
          label: "New field",
          type: "text",
          required: false,
          options: [],
        },
      ],
    }));
  }

  function removeField(index) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  }

  async function saveForm(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSaveForm(draft);
      onNotify(`${draft.title} saved and ${draft.isPublished ? "published" : "unpublished"}.`);
    } catch (error) {
      onNotify(readableError(error), "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function clearStoredRegistrationData() {
    if (
      !window.confirm(
        "Clear saved student and instructor registration data from the system? Active accounts and lesson progress will be kept.",
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      const result = await onClearRegistrationData();
      onNotify(
        `Registration data cleared for ${result?.students_cleared ?? 0} students and ${result?.instructors_cleared ?? 0} instructors.`,
      );
    } catch (error) {
      onNotify(readableError(error), "error");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Registration forms"
        title="Publish and modify registration forms"
        description="Control the fields shown on student and volunteer instructor forms, including which responses are compulsory."
      />

      <div className="admin-form-tabs" role="tablist" aria-label="Registration form type">
        <button
          className={selectedKind === "student" ? "is-active" : ""}
          type="button"
          onClick={() => setSelectedKind("student")}
        >
          <GraduationCap aria-hidden="true" size={20} />
          Student form
        </button>
        <button
          className={selectedKind === "volunteer_instructor" ? "is-active" : ""}
          type="button"
          onClick={() => setSelectedKind("volunteer_instructor")}
        >
          <UsersThree aria-hidden="true" size={20} />
          Volunteer instructor form
        </button>
      </div>

      {!draft ? (
        <section className="admin-panel">
          <EmptyState>Apply the latest database migration to manage registration forms.</EmptyState>
        </section>
      ) : (
        <form className="admin-form-builder" onSubmit={saveForm}>
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h3>Form details</h3>
                <p>The title and introduction appear on the public registration page.</p>
              </div>
              <label className="admin-publish-toggle">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(event) => updateDraft({ isPublished: event.target.checked })}
                />
                Published
              </label>
            </div>
            <div className="admin-form-grid">
              <label className="admin-form-grid__wide">
                Form title
                <input
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  required
                />
              </label>
              <label className="admin-form-grid__wide">
                Introduction
                <textarea
                  rows="3"
                  value={draft.description}
                  onChange={(event) => updateDraft({ description: event.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h3>Form fields</h3>
                <p>Full name, email, username, and privacy consent stay compulsory because they create secure accounts and record permission to process registration data. Password setup happens through a secure email link.</p>
              </div>
              <button className="admin-secondary-button" type="button" onClick={addField}>
                <Plus aria-hidden="true" size={18} />
                Add field
              </button>
            </div>
            <div className="admin-field-builder-list">
              {draft.fields.map((field, index) => {
                  const protectedField = ["full_name", "email", "username", "privacy_consent"].includes(field.key);
                return (
                  <article key={field.key}>
                    <label>
                      Field label
                      <input
                        value={field.label}
                        onChange={(event) => updateField(index, { label: event.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Field type
                      <select
                        value={field.type}
                        onChange={(event) => updateField(index, { type: event.target.value })}
                        disabled={protectedField}
                      >
                        <option value="text">Short text</option>
                        <option value="email">Email</option>
                        <option value="tel">Phone</option>
                        <option value="textarea">Long text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="select">Dropdown</option>
                      </select>
                    </label>
                    {field.type === "select" && (
                      <label>
                        Options (comma-separated)
                        <input
                          value={(field.options ?? []).join(", ")}
                          onChange={(event) =>
                            updateField(index, {
                              options: event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                    )}
                    <label className="admin-field-required">
                      <input
                        type="checkbox"
                        checked={field.required}
                        disabled={protectedField}
                        onChange={(event) => updateField(index, { required: event.target.checked })}
                      />
                      Compulsory
                    </label>
                    <button
                      className="admin-icon-danger"
                      type="button"
                      disabled={protectedField}
                      onClick={() => removeField(index)}
                      aria-label={`Remove ${field.label}`}
                    >
                      <Trash aria-hidden="true" size={18} />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h3>Registration data cleanup</h3>
                <p>Clear saved student and instructor form payloads together with campaign enrolment history while leaving active accounts and lesson progress intact.</p>
              </div>
            </div>
            <button
              className="admin-danger-button"
              type="button"
              onClick={clearStoredRegistrationData}
              disabled={isClearing}
            >
              <Trash aria-hidden="true" size={18} />
              {isClearing ? "Clearing..." : "Clear saved registration data"}
            </button>
          </section>

          <button className="admin-primary-button admin-form-save" type="submit" disabled={isSaving}>
            <FloppyDisk aria-hidden="true" size={19} />
            {isSaving ? "Saving..." : "Save registration form"}
          </button>
        </form>
      )}
    </>
  );
}

function NewsManagement({ news, onPublishNews, onDeleteNews, onNotify }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaType, setMediaType] = useState("Text");
  const [mediaFile, setMediaFile] = useState(null);

  async function publishNewsItem(event) {
    event.preventDefault();
    try {
      await onPublishNews({
        title: title.trim(),
        body: body.trim(),
        mediaType,
        mediaFile,
      });
      setTitle("");
      setBody("");
      setMediaType("Text");
      setMediaFile(null);
      onNotify("News item published.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  async function removeNewsItem(item) {
    try {
      await onDeleteNews(item);
      onNotify("News item removed.");
    } catch (error) {
      onNotify(readableError(error), "error");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="News"
        title="Publish school news"
        description="Create announcements with text, photographs, or video attachments."
      />
      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Create news item</h3>
              <p>Published items are ready for the public News area.</p>
            </div>
          </div>
          <form className="admin-form-grid" onSubmit={publishNewsItem}>
            <label className="admin-form-grid__wide">
              Headline
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="News headline"
                required
              />
            </label>
            <label className="admin-form-grid__wide">
              News text
              <textarea
                rows="7"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write the announcement"
                required
              />
            </label>
            <label>
              Media type
              <select
                value={mediaType}
                onChange={(event) => setMediaType(event.target.value)}
              >
                <option>Text</option>
                <option>Photo</option>
                <option>Video</option>
              </select>
            </label>
            {mediaType !== "Text" && (
              <label className="admin-file-field">
                {mediaType} file
                <input
                  type="file"
                  accept={mediaType === "Photo" ? "image/*" : "video/*"}
                  onChange={(event) =>
                    setMediaFile(event.target.files?.[0] ?? null)
                  }
                  required
                />
              </label>
            )}
            <button className="admin-primary-button" type="submit">
              <Megaphone aria-hidden="true" size={19} />
              Publish news
            </button>
          </form>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Published news</h3>
              <p>{news.length} items in the news archive.</p>
            </div>
          </div>
          <div className="admin-news-list">
            {news.map((item) => (
              <article key={item.id}>
                <span className="admin-news-icon">
                  {item.mediaType === "Text" ? (
                    <Newspaper aria-hidden="true" size={23} />
                  ) : (
                    <Megaphone aria-hidden="true" size={23} />
                  )}
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <small>
                    {item.publishedAt} · {item.mediaType}
                    {item.mediaName ? ` · ${item.mediaName}` : ""}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => removeNewsItem(item)}
                  aria-label={`Remove ${item.title}`}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function AdminDashboard({
  adminProfileId,
  adminEmail,
  data,
  actions,
  onSignOut,
}) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const activeSectionLabel =
    adminSections.find((section) => section.id === activeSection)?.label ??
    "Dashboard";

  const sectionCounts = useMemo(
    () => ({
      students: data.students.length,
      instructors: countWhere(
        data.instructors,
        (instructor) => instructor.approval !== "Approved",
      ),
      lessons: countWhere(data.lessons, (lesson) => lesson.status !== "Uploaded"),
      questions: data.questions.length,
      certificates: data.certificates.length,
      recruitment: countWhere(
        data.recruitmentCampaigns,
        (campaign) => campaign.status === "Active",
      ),
      forms: data.registrationForms.length,
      news: data.news.length,
    }),
    [data],
  );

  function notify(message, tone = "success") {
    setToast({ message, tone });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(
    () => () => window.clearTimeout(toastTimerRef.current),
    [],
  );

  function selectSection(sectionId) {
    setActiveSection(sectionId);
    setIsMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let content;
  if (activeSection === "students") {
    content = (
      <StudentManagement
        students={data.students}
        instructors={data.instructors}
        lessons={data.lessons}
        questions={data.questions}
        submissions={data.submissions}
        onAssignStudent={actions.assignStudent}
        onDeleteAccount={actions.deleteAccount}
        onNotify={notify}
      />
    );
  } else if (activeSection === "instructors") {
    content = (
      <InstructorManagement
        instructors={data.instructors}
        students={data.students}
        messages={data.instructorMessages}
        adminProfileId={adminProfileId}
        onApproveInstructor={actions.approveInstructor}
        onSendMessage={actions.sendAdminMessage}
        onUpdateInstructor={actions.updateInstructor}
        onDeleteAccount={actions.deleteAccount}
        onNotify={notify}
      />
    );
  } else if (activeSection === "lessons") {
    content = (
      <LessonManagement
        lessons={data.lessons}
        onUploadLesson={actions.uploadLesson}
        onNotify={notify}
      />
    );
  } else if (activeSection === "questions") {
    content = (
      <QuestionManagement
        questions={data.questions}
        instructors={data.instructors}
        onAddQuestion={actions.addQuestion}
        onUpdateQuestionType={actions.updateQuestionType}
        onMoveQuestion={actions.moveQuestion}
        onDeleteQuestion={actions.deleteQuestion}
        onNotify={notify}
      />
    );
  } else if (activeSection === "certificates") {
    content = (
      <CertificateManagement
        certificates={data.certificates}
        students={data.students}
        onIssueCertificate={actions.issueCertificate}
        onUploadCertificatePdf={actions.uploadCertificatePdf}
        onNotify={notify}
      />
    );
  } else if (activeSection === "reports") {
    content = (
      <Reports
        students={data.students}
        instructors={data.instructors}
        certificates={data.certificates}
        onNotify={notify}
      />
    );
  } else if (activeSection === "recruitment") {
    content = (
      <RecruitmentManagement
        campaigns={data.recruitmentCampaigns}
        enrolments={data.recruitmentEnrolments}
        onCreateCampaign={actions.createRecruitmentCampaign}
        onDeleteCampaign={actions.deleteRecruitmentCampaign}
        onNotify={notify}
      />
    );
  } else if (activeSection === "forms") {
    content = (
      <RegistrationFormManagement
        forms={data.registrationForms}
        onSaveForm={actions.saveRegistrationForm}
        onClearRegistrationData={actions.clearRegistrationData}
        onNotify={notify}
      />
    );
  } else if (activeSection === "news") {
    content = (
      <NewsManagement
        news={data.news}
        onPublishNews={actions.publishNews}
        onDeleteNews={actions.deleteNews}
        onNotify={notify}
      />
    );
  } else if (activeSection === "zoom") {
    content = <ZoomAdministration instructors={data.instructors} students={data.students} lessons={data.lessons} />;
  } else {
    content = (
      <DashboardSummary
        students={data.students}
        instructors={data.instructors}
      />
    );
  }

  return (
    <div className="admin-shell">
      <aside
        className={
          isMobileNavOpen
            ? "admin-sidebar admin-sidebar--open"
            : "admin-sidebar"
        }
      >
        <div className="admin-sidebar-brand">
          <img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" />
          <span>
            <strong>DBS Kaduna</strong>
            <small>Administration</small>
          </span>
        </div>
        <nav aria-label="Admin sections">
          {adminSections.map((section) => {
            const Icon = sectionIcons[section.id];
            const count = sectionCounts[section.id];
            return (
              <button
                className={activeSection === section.id ? "is-active" : ""}
                type="button"
                key={section.id}
                onClick={() => selectSection(section.id)}
              >
                <Icon aria-hidden="true" size={21} weight="duotone" />
                <span>{section.label}</span>
                {count !== undefined && count > 0 && <small>{count}</small>}
              </button>
            );
          })}
        </nav>
        <div className="admin-sidebar-footer">
          <a href="/">
            <ArrowDown aria-hidden="true" size={18} />
            Public homepage
          </a>
          <button type="button" onClick={onSignOut}>
            <SignOut aria-hidden="true" size={19} />
            Sign out
          </button>
        </div>
      </aside>

      {isMobileNavOpen && (
        <button
          className="admin-sidebar-backdrop"
          type="button"
          onClick={() => setIsMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="admin-mobile-menu"
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open admin navigation"
          >
            <List aria-hidden="true" size={24} />
          </button>
          <div>
            <p>Discover Bible School, Kaduna</p>
            <h1>{activeSectionLabel}</h1>
          </div>
          <div className="admin-account">
            <span>
              <UserCircle aria-hidden="true" size={25} weight="duotone" />
            </span>
            <div>
              <strong>Administrator</strong>
              <small>{adminEmail}</small>
            </div>
          </div>
          <button
            className="admin-topbar-signout"
            type="button"
            onClick={onSignOut}
          >
            <SignOut aria-hidden="true" size={19} weight="bold" />
            <span>Sign out</span>
          </button>
        </header>

        <main className={`admin-content admin-content--${activeSection}`}>{content}</main>
      </div>

      {toast && (
        <div className={`admin-toast admin-toast--${toast.tone}`} role="status">
          {toast.tone === "success" ? (
            <Check aria-hidden="true" size={20} weight="bold" />
          ) : (
            <X aria-hidden="true" size={20} weight="bold" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
