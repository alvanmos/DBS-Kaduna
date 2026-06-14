import React, { useEffect, useMemo, useRef, useState } from "react";
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
  DownloadSimple,
  FilePdf,
  Gauge,
  GraduationCap,
  List,
  MapPin,
  Megaphone,
  Newspaper,
  Plus,
  Question,
  SignOut,
  Student,
  UploadSimple,
  UserCheck,
  UserCircle,
  UserMinus,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { adminSections } from "./adminData.js";

const sectionIcons = {
  dashboard: Gauge,
  students: Student,
  instructors: UsersThree,
  lessons: BookOpenText,
  questions: Question,
  certificates: Certificate,
  reports: ChartBar,
  news: Newspaper,
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

function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`admin-status admin-status--${tone}`}>{children}</span>;
}

function EmptyState({ children }) {
  return <p className="admin-empty-state">{children}</p>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="admin-page-heading">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{description}</span>
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
  onAssignStudent,
  onNotify,
}) {
  const [query, setQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [mapMode, setMapMode] = useState("selected");

  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.serial} ${student.denomination}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? students[0];

  async function assignInstructor(studentId, instructorId) {
    try {
      await onAssignStudent(studentId, instructorId);
      onNotify("Student assignment updated.");
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
              </dl>
              <div className="admin-progress admin-progress--large">
                <span style={{ width: `${selectedStudent.progress}%` }} />
              </div>
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
    </>
  );
}

function InstructorManagement({
  instructors,
  students,
  onApproveInstructor,
  onUpdateInstructor,
  onNotify,
}) {
  const [capacityById, setCapacityById] = useState(() =>
    Object.fromEntries(
      instructors.map((instructor) => [instructor.id, instructor.maxLoad]),
    ),
  );
  const studentLoad = (instructorId) =>
    countWhere(students, (student) => student.instructorId === instructorId);

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
        instructor.applicationId,
        Number(capacityById[instructor.id] ?? 10),
      );
      onNotify(`${instructor.name} approved as an instructor.`);
    } catch (error) {
      onNotify(readableError(error), "error");
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
                      <p>{instructor.email}</p>
                      <p>{instructor.whatsapp}</p>
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
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
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
  onMoveQuestion,
  onDeleteQuestion,
  onNotify,
}) {
  const [lesson, setLesson] = useState(1);
  const [type, setType] = useState("Multiple choice");
  const [marker, setMarker] = useState("");
  const [prompt, setPrompt] = useState("");

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
                  <div>
                    <strong>{question.prompt}</strong>
                    <small>
                      {question.type} · {question.marker}
                    </small>
                  </div>
                  <div className="admin-question-controls">
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
  onNotify,
}) {
  const eligibleStudents = students.filter(
    (student) =>
      student.milestone === "Graduated" ||
      student.milestone === "Awaiting Graduation",
  );
  const [studentId, setStudentId] = useState(eligibleStudents[0]?.id ?? "");
  const [verificationCode, setVerificationCode] = useState("");

  async function generateCertificate() {
    if (!studentId) return;
    try {
      const certificate = await onIssueCertificate(studentId);
      setVerificationCode(certificate?.verification_code ?? "");
      onNotify("Digital certificate generated.");
    } catch (error) {
      onNotify(readableError(error), "error");
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
              <p>Select an eligible student and issue a verification code.</p>
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
          </div>
          {verificationCode && (
            <div className="admin-certificate-preview">
              <img src="/dbs-kaduna-logo.png?v=20260614" alt="" />
              <p>Discover Bible School, Kaduna</p>
              <h3>Certificate of Completion</h3>
              <span>This certifies that</span>
              <strong>
                {students.find((student) => student.id === studentId)?.name}
              </strong>
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
        onAssignStudent={actions.assignStudent}
        onNotify={notify}
      />
    );
  } else if (activeSection === "instructors") {
    content = (
      <InstructorManagement
        instructors={data.instructors}
        students={data.students}
        onApproveInstructor={actions.approveInstructor}
        onUpdateInstructor={actions.updateInstructor}
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
  } else if (activeSection === "news") {
    content = (
      <NewsManagement
        news={data.news}
        onPublishNews={actions.publishNews}
        onDeleteNews={actions.deleteNews}
        onNotify={notify}
      />
    );
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
        </header>

        <main className="admin-content">{content}</main>
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
