import { authenticated, json, method, rateLimit, zoomAccountToken, zoomFetch, recordOperationFailure, audit } from "../_zoom.js";
function csv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"]) || !rateLimit(req, res, "zoom-admin", 25)) return;
  try {
    const { supabase, profile } = await authenticated(req, ["admin"]);
    if (req.method === "POST") {
      const classId = String(req.body?.classId || ""); const action = req.body?.action;
      const { data: classRecord, error: classError } = await supabase.from("zoom_classes").select("id,meeting_id,zoom_account_id,zoom_accounts(*)").eq("id", classId).single(); if (classError || !classRecord) throw new Error("Class not found.");
      if (action === "cancel") { try { await zoomFetch(`/meetings/${encodeURIComponent(classRecord.meeting_id)}`, await zoomAccountToken(supabase, classRecord.zoom_accounts), { method: "DELETE" }); } catch (error) { await recordOperationFailure(supabase, profile.id, "admin_cancel_meeting", error, classId); throw error; } await supabase.from("zoom_classes").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", classId); }
      else if (action === "deactivate") await supabase.from("zoom_classes").update({ status: "deactivated" }).eq("id", classId);
      else throw new Error("Unknown Zoom class action.");
      await audit(supabase, profile.id, `zoom_class_admin_${action}`, "zoom_class", classId); return json(res, 200, { ok: true });
    }
    const { instructorId, studentId, lesson, status, date, format } = req.query;
    let query = supabase.from("zoom_classes").select("id,meeting_id,topic,lesson_number,scheduled_start,duration_minutes,status,instructions,created_at,instructors(id,profiles(full_name,email)),lessons(number,title),zoom_class_attendees(student_id,attendance_status,joined_at,left_at,total_minutes,students(full_name,email)),zoom_accounts(zoom_email,connection_status)").order("scheduled_start", { ascending: false });
    if (instructorId) query = query.eq("instructor_id", instructorId); if (lesson) query = query.eq("lesson_number", Number(lesson)); if (status) query = query.eq("status", status); if (date) query = query.gte("scheduled_start", `${date}T00:00:00+01:00`).lt("scheduled_start", `${date}T23:59:59+01:00`);
    const { data, error } = await query; if (error) throw error;
    const filtered = studentId ? data.filter((item) => item.zoom_class_attendees?.some((attendee) => attendee.student_id === studentId)) : data;
    const { data: accounts, error: accountsError } = await supabase.from("zoom_accounts").select("instructor_id,zoom_email,connection_status,connected_at,connection_error,instructors(profiles(full_name,email))"); if (accountsError) throw accountsError;
    const { data: failures, error: failuresError } = await supabase.from("zoom_operation_errors").select("id,operation,error_message,created_at,zoom_class_id,instructor_profile_id").order("created_at", { ascending: false }).limit(100); if (failuresError) throw failuresError;
    if (format === "csv") { const lines = ["Class,Meeting ID,Lesson,Date (Africa/Lagos),Status,Instructor,Student,Attendance,Join time,Leave time,Minutes"]; filtered.forEach((item) => (item.zoom_class_attendees || []).forEach((attendee) => lines.push([item.topic,item.meeting_id,item.lessons?.title || `Lesson ${item.lesson_number}`,new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(item.scheduled_start)),item.status,item.instructors?.profiles?.full_name || "",attendee.students?.full_name || "",attendee.attendance_status,attendee.joined_at || "",attendee.left_at || "",attendee.total_minutes || ""].map(csv).join(",")))); res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=zoom-class-attendance.csv"); return res.status(200).send(lines.join("\n")); }
    return json(res, 200, { classes: filtered, accounts: accounts || [], failures: failures || [] });
  } catch (error) { return json(res, /permission|Authentication/i.test(error.message) ? 403 : 500, { error: error.message || "Zoom administration is unavailable." }); }
}
