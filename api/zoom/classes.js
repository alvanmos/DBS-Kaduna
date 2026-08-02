import { authenticated, instructorForProfile, json, lagosTimestamp, method, rateLimit, recordOperationFailure, zoomAccountToken, zoomFetch, audit } from "../_zoom.js";

function cleanText(value, max = 500) { return String(value || "").trim().slice(0, max); }
async function accountForInstructor(supabase, instructorId) {
  const { data, error } = await supabase.from("zoom_accounts").select("*").eq("instructor_id", instructorId).eq("connection_status", "connected").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Connect your Zoom account before scheduling a class.");
  return data;
}
async function assignedStudents(supabase, instructorId, studentIds) {
  const unique = [...new Set(Array.isArray(studentIds) ? studentIds : [])];
  if (!unique.length) throw new Error("Select at least one assigned student.");
  const { data, error } = await supabase.from("students").select("id").eq("instructor_id", instructorId).in("id", unique);
  if (error) throw error;
  if (data.length !== unique.length) throw new Error("Every attendee must be one of your assigned students.");
  return unique;
}
async function classRows(supabase, role, profileId) {
  // The service client bypasses RLS, so student visibility must be constrained
  // explicitly with an inner attendee join. Without !inner, PostgREST only
  // filtered the embedded attendee records and still returned every class.
  const attendeeRelation = role === "student" ? "zoom_class_attendees!inner" : "zoom_class_attendees";
  let query = supabase.from("zoom_classes").select(`id,meeting_id,topic,lesson_number,scheduled_start,duration_minutes,instructions,status,cancelled_at,created_at,instructor_id,${attendeeRelation}(student_id,attendance_status,students(id,full_name,email)),instructors(id,profiles(full_name,email)),lessons(number,title)`).order("scheduled_start", { ascending: false });
  if (role === "instructor") { const instructor = await instructorForProfile(supabase, profileId); query = query.eq("instructor_id", instructor.id); }
  if (role === "student") { const { data: student, error } = await supabase.from("students").select("id").eq("profile_id", profileId).single(); if (error || !student) throw new Error("Student record not found."); query = query.eq("zoom_class_attendees.student_id", student.id); }
  const { data, error } = await query; if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "PATCH", "DELETE"]) || !rateLimit(req, res, "zoom-classes", 45)) return;
  try {
    const wantedRoles = req.method === "GET" ? ["instructor", "student"] : ["instructor"];
    const { supabase, profile } = await authenticated(req, wantedRoles);
    if (req.method === "GET") return json(res, 200, { classes: await classRows(supabase, profile.role, profile.id) });
    const instructor = await instructorForProfile(supabase, profile.id);
    const body = req.body || {};
    if (req.method === "POST") {
      const topic = cleanText(body.topic, 200); if (topic.length < 2) throw new Error("Enter a class title of at least two characters.");
      const lessonNumber = Number(body.lessonNumber); if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 26) throw new Error("Choose a DBS lesson.");
      const duration = Math.max(15, Math.min(480, Number(body.durationMinutes))); if (!Number.isFinite(duration)) throw new Error("Choose a valid class duration.");
      const start = lagosTimestamp(body.date, body.time); if (start.getTime() < Date.now() + 5 * 60_000) throw new Error("Choose a class time at least five minutes in the future.");
      const studentIds = await assignedStudents(supabase, instructor.id, body.studentIds); const account = await accountForInstructor(supabase, instructor.id);
      let meeting;
      try { meeting = await zoomFetch(`/users/${encodeURIComponent(account.zoom_user_id || "me")}/meetings`, await zoomAccountToken(supabase, account), { method: "POST", body: JSON.stringify({ topic, type: 2, start_time: start.toISOString(), duration, timezone: "Africa/Lagos", agenda: cleanText(body.instructions, 1200), settings: { waiting_room: true, join_before_host: false } }) }); }
      catch (error) { await recordOperationFailure(supabase, profile.id, "create_meeting", error); throw error; }
      const { data: created, error } = await supabase.from("zoom_classes").insert({ meeting_id: String(meeting.id), meeting_uuid: meeting.uuid || null, topic, lesson_number: lessonNumber, instructor_id: instructor.id, zoom_account_id: account.id, scheduled_start: start.toISOString(), duration_minutes: duration, participant_join_url: meeting.join_url, host_start_url_encrypted: meeting.start_url ? (await import("../_zoom.js")).encrypt(meeting.start_url) : null, instructions: cleanText(body.instructions, 1200) || null, status: "upcoming" }).select("id").single();
      if (error) throw error;
      const { error: attendeeError } = await supabase.from("zoom_class_attendees").insert(studentIds.map((student_id) => ({ zoom_class_id: created.id, student_id })));
      if (attendeeError) throw attendeeError; await audit(supabase, profile.id, "zoom_class_created", "zoom_class", created.id, { meetingId: String(meeting.id), studentCount: studentIds.length }); return json(res, 201, { id: created.id });
    }
    const classId = String(body.classId || ""); if (!classId) throw new Error("Class ID is required.");
    const { data: existing, error: existingError } = await supabase.from("zoom_classes").select("*,zoom_accounts(*)").eq("id", classId).eq("instructor_id", instructor.id).single();
    if (existingError || !existing) throw new Error("This class was not found or does not belong to you.");
    const account = existing.zoom_accounts;
    if (req.method === "DELETE") {
      try { await zoomFetch(`/meetings/${encodeURIComponent(existing.meeting_id)}`, await zoomAccountToken(supabase, account), { method: "DELETE" }); }
      catch (error) { await recordOperationFailure(supabase, profile.id, "cancel_meeting", error, classId); throw error; }
      const { error } = await supabase.from("zoom_classes").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", classId); if (error) throw error;
      await audit(supabase, profile.id, "zoom_class_cancelled", "zoom_class", classId); return json(res, 200, { ok: true });
    }
    const topic = cleanText(body.topic ?? existing.topic, 200); const duration = Math.max(15, Math.min(480, Number(body.durationMinutes ?? existing.duration_minutes))); const start = body.date || body.time ? lagosTimestamp(body.date, body.time) : new Date(existing.scheduled_start);
    const studentIds = await assignedStudents(supabase, instructor.id, body.studentIds || []);
    try { await zoomFetch(`/meetings/${encodeURIComponent(existing.meeting_id)}`, await zoomAccountToken(supabase, account), { method: "PATCH", body: JSON.stringify({ topic, start_time: start.toISOString(), duration, timezone: "Africa/Lagos", agenda: cleanText(body.instructions ?? existing.instructions, 1200) }) }); }
    catch (error) { await recordOperationFailure(supabase, profile.id, "update_meeting", error, classId); throw error; }
    const { error } = await supabase.from("zoom_classes").update({ topic, lesson_number: Number(body.lessonNumber || existing.lesson_number), scheduled_start: start.toISOString(), duration_minutes: duration, instructions: cleanText(body.instructions ?? existing.instructions, 1200) || null, status: "upcoming", cancelled_at: null }).eq("id", classId); if (error) throw error;
    await supabase.from("zoom_class_attendees").delete().eq("zoom_class_id", classId); const { error: attendeeError } = await supabase.from("zoom_class_attendees").insert(studentIds.map((student_id) => ({ zoom_class_id: classId, student_id }))); if (attendeeError) throw attendeeError;
    await audit(supabase, profile.id, "zoom_class_updated", "zoom_class", classId); return json(res, 200, { ok: true });
  } catch (error) { const status = /Authentication|permission|not found|does not belong|assigned student/i.test(error.message) ? 403 : /Connect your Zoom|Choose |Enter |Select /i.test(error.message) ? 400 : 500; return json(res, status, { error: error.message || "Zoom class operation failed." }); }
}
