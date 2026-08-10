import React, { useEffect, useState } from "react";
import { DownloadSimple, VideoCamera, WarningCircle } from "@phosphor-icons/react";
import {
  adminZoomClassAction,
  downloadZoomCsv,
  loadZoomAdmin,
} from "./zoomRepository.js";

const formatDate = (value) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));

const labelStatus = (value) =>
  String(value || "unknown").replace(/_/g, " ");

export function ZoomAdministration({ instructors, students, lessons }) {
  const [filters, setFilters] = useState({
    instructorId: "",
    studentId: "",
    lesson: "",
    status: "",
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setError("");
      setData(await loadZoomAdmin(filters));
    } catch (problem) {
      setError(problem.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const act = (classId, action) =>
    adminZoomClassAction(classId, action)
      .then(refresh)
      .catch((problem) => setError(problem.message));

  const classCount = data?.classes?.length || 0;

  return (
    <section className="zoom-admin">
      <div className="admin-page-heading zoom-admin-heading">
        <div className="admin-page-heading__copy">
          <span className="admin-page-heading__icon"><VideoCamera aria-hidden="true" size={27} weight="duotone" /></span>
          <div>
            <p>Zoom oversight</p>
            <h2>Zoom Classes</h2>
            <span>
              Monitor classes, linked accounts, attendance, and securely recorded Zoom errors.
            </span>
          </div>
        </div>
        <button
          className="admin-secondary-button"
          type="button"
          onClick={() =>
            downloadZoomCsv(filters).catch((problem) => setError(problem.message))
          }
        >
          <DownloadSimple size={18} />
          Export CSV
        </button>
      </div>

      <section className="admin-panel zoom-admin-filters" aria-label="Filter Zoom classes">
        <div className="zoom-admin-filter-heading">
          <strong>Find classes</strong>
          <span>Use one or more filters, then apply them to update the register.</span>
        </div>
        <div className="zoom-admin-filter-fields">
          <label>
            Instructor
            <select
              value={filters.instructorId}
              onChange={(event) => setFilters({ ...filters, instructorId: event.target.value })}
            >
              <option value="">All instructors</option>
              {instructors
                .filter((item) => !String(item.id).startsWith("application-"))
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Student
            <select
              value={filters.studentId}
              onChange={(event) => setFilters({ ...filters, studentId: event.target.value })}
            >
              <option value="">All students</option>
              {students.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lesson
            <select
              value={filters.lesson}
              onChange={(event) => setFilters({ ...filters, lesson: event.target.value })}
            >
              <option value="">All lessons</option>
              {lessons.map((item) => (
                <option value={item.number} key={item.number}>
                  Lesson {item.number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              <option value="">All statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </label>
          <button className="admin-primary-button zoom-admin-filter-submit" type="button" onClick={refresh}>
            Apply filters
          </button>
        </div>
      </section>

      {error && (
        <p className="admin-empty-state zoom-admin-error">
          <WarningCircle size={18} /> {error}
        </p>
      )}

      <section className="admin-panel zoom-admin-table">
        <div className="zoom-admin-section-heading">
          <div>
            <p>Class register</p>
            <h3>Scheduled classes</h3>
          </div>
          <span className="zoom-admin-count">
            {classCount} {classCount === 1 ? "class" : "classes"}
          </span>
        </div>
        {classCount ? (
          <div className="zoom-admin-table-wrap">
            <table>
              <caption>Scheduled Zoom classes</caption>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Lesson</th>
                  <th>Instructor</th>
                  <th>Time (WAT)</th>
                  <th>Attendees</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((item) => (
                  <tr key={item.id}>
                    <td className="zoom-admin-class-cell">
                      <strong>{item.topic}</strong>
                      <small>Meeting {item.meeting_id}</small>
                    </td>
                    <td>{item.lessons?.title || `Lesson ${item.lesson_number}`}</td>
                    <td>{item.instructors?.profiles?.full_name || "Not available"}</td>
                    <td>
                      <time dateTime={item.scheduled_start}>{formatDate(item.scheduled_start)}</time>
                    </td>
                    <td>
                      <ul className="zoom-admin-attendees">
                        {(item.zoom_class_attendees || []).map((attendee) => (
                          <li key={attendee.student_id}>
                            <strong>{attendee.students?.full_name || "Student"}</strong>
                            <span>{labelStatus(attendee.attendance_status)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <span className={`zoom-admin-status zoom-admin-status--${item.status}`}>
                        {labelStatus(item.status)}
                      </span>
                    </td>
                    <td>
                      {item.status === "upcoming" && (
                        <div className="zoom-admin-actions">
                          <button
                            className="admin-secondary-button"
                            type="button"
                            onClick={() => act(item.id, "deactivate")}
                          >
                            Deactivate
                          </button>
                          <button
                            className="admin-danger-button"
                            type="button"
                            onClick={() => act(item.id, "cancel")}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {item.status !== "upcoming" && (
                        <span className="zoom-admin-no-actions">No actions</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty-state">No Zoom Classes match these filters.</p>
        )}
      </section>

      <section className="admin-panel zoom-admin-accounts">
        <div className="zoom-admin-section-heading">
          <div>
            <p>Connected services</p>
            <h3>Instructor Zoom accounts</h3>
          </div>
        </div>
        {data?.accounts?.length ? (
          <ul className="zoom-admin-account-list">
            {data.accounts.map((account) => (
              <li key={account.instructor_id}>
                <div className="zoom-admin-account-avatar" aria-hidden="true">
                  {(account.instructors?.profiles?.full_name || "I").slice(0, 1)}
                </div>
                <div>
                  <strong>{account.instructors?.profiles?.full_name || "Instructor"}</strong>
                  <span>{account.zoom_email || "No email returned"}</span>
                </div>
                <span className={`zoom-admin-status zoom-admin-status--${account.connection_status}`}>
                  {labelStatus(account.connection_status)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-empty-state">No Zoom accounts connected.</p>
        )}
      </section>

      {data?.failures?.length > 0 && (
        <section className="admin-panel zoom-admin-failures">
          <div className="zoom-admin-section-heading">
            <div>
              <p>Needs attention</p>
              <h3>Recent Zoom operation failures</h3>
            </div>
          </div>
          {data.failures.map((failure) => (
            <p className="admin-empty-state" key={failure.id}>
              <strong>{failure.operation}:</strong> {failure.error_message}
            </p>
          ))}
        </section>
      )}
    </section>
  );
}
