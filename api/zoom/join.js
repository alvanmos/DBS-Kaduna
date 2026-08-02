import { authenticated, json, method, rateLimit, audit } from "../_zoom.js";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !rateLimit(req, res, "zoom-join", 20)) return;
  try {
    const { supabase, profile } = await authenticated(req, ["student"]); const classId = String(req.body?.classId || "");
    const { data: student, error: studentError } = await supabase.from("students").select("id").eq("profile_id", profile.id).single(); if (studentError || !student) throw new Error("Student record not found.");
    const { data: attendee, error } = await supabase.from("zoom_class_attendees").select("zoom_class_id,zoom_classes(id,participant_join_url,scheduled_start,duration_minutes,status,topic)").eq("zoom_class_id", classId).eq("student_id", student.id).single(); if (error || !attendee?.zoom_classes) throw new Error("You are not assigned to this class.");
    const meeting = attendee.zoom_classes; if (meeting.status === "cancelled") throw new Error("This class has been cancelled.");
    const start = new Date(meeting.scheduled_start).getTime(); const end = start + Number(meeting.duration_minutes) * 60_000 + 60 * 60_000; const now = Date.now(); if (now < start - 15 * 60_000 || now > end) throw new Error("Join Class becomes available 15 minutes before the scheduled time and closes one hour after class.");
    await audit(supabase, profile.id, "zoom_class_join_link_requested", "zoom_class", classId); return json(res, 200, { joinUrl: meeting.participant_join_url });
  } catch (error) { return json(res, /not assigned|permission|Authentication|Student record/i.test(error.message) ? 403 : 400, { error: error.message || "Class access failed." }); }
}
