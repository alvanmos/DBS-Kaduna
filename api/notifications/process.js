import { createClient } from "@supabase/supabase-js";

const SUPPORTED_VARIABLES = new Set(["student_first_name", "student_full_name", "student_registration_number", "instructor_name", "previous_instructor_name", "new_instructor_name", "lesson_number", "lesson_title", "class_date", "class_time", "programme_name", "dashboard_link", "submission_link", "question_link", "class_link", "certificate_link", "reactivation_link"]);
const MAX_ITEMS = 25;

function serviceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function render(template, values) {
  return String(template).replace(/{{\s*([a-z_]+)\s*}}/g, (_, key) => {
    if (!SUPPORTED_VARIABLES.has(key)) throw new Error(`Unsupported template variable: {{${key}}}`);
    return escapeHtml(values[key] ?? "");
  });
}
function appUrl() { return String(process.env.DISCOVER_BIBLE_SCHOOL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, ""); }
function htmlEmail(subject, message, link, buttonLabel = "Open secure dashboard") { return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#102346"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 28px;background:#071c45;color:#fff"><strong style="font-size:20px">Discover Bible School Kaduna</strong></td></tr><tr><td style="padding:28px"><h1 style="font-size:22px;margin:0 0 14px">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.6">${message}</p>${link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#0c4da2;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(buttonLabel)}</a></p>` : ""}<p style="font-size:13px;color:#60708a">Detailed information is available after secure login at ${escapeHtml(appUrl())}.</p></td></tr></table></td></tr></table></body></html>`; }
function templateValues(queue, recipient) { const payload = queue.event_payload || {}; const fullName = payload.student_full_name || ""; return { ...payload, student_full_name: fullName, student_first_name: fullName.split(/\s+/)[0] || "Student", dashboard_link: payload.dashboard_link || "/student", submission_link: payload.submission_link || "/instructor", question_link: payload.question_link || "/instructor", class_link: payload.class_link || "/student", certificate_link: payload.certificate_link || "/student", reactivation_link: payload.reactivation_link || "", recipient_name: recipient?.full_name || "" }; }
function absoluteLink(value) { if (!value) return appUrl(); return /^https?:\/\//.test(value) ? value : `${appUrl()}${value.startsWith("/") ? "" : "/"}${value}`; }

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
  const authorization = req.headers.authorization;
  const isWorkerRequest = Boolean(process.env.NOTIFICATION_WORKER_SECRET) && authorization === `Bearer ${process.env.NOTIFICATION_WORKER_SECRET}`;
  const isCronRequest = Boolean(process.env.CRON_SECRET) && authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!isWorkerRequest && !isCronRequest) return res.status(401).json({ error: "Unauthorized." });
  const supabase = serviceClient();
  const { data: inactivated, error: inactivityError } = await supabase.rpc("process_student_inactivity", { input_inactivity_days: 60 });
  if (inactivityError) return res.status(500).json({ error: inactivityError.message });
  if (!process.env.RESEND_API_KEY || process.env.DISCOVER_BIBLE_SCHOOL_EMAIL_ENABLED !== "true") return res.status(503).json({ error: "Automated email delivery is disabled.", inactivated: inactivated?.length ?? 0 });
  const { data: queue, error } = await supabase.rpc("email_claim_notification_queue", { input_limit: MAX_ITEMS });
  if (error) return res.status(500).json({ error: error.message });
  const results = [];
  for (const item of queue || []) {
    try {
      const [{ data: rule }, { data: recipient }] = await Promise.all([
        supabase.from("automated_email_rules").select("*").eq("id", item.automation_rule_id).single(),
        supabase.from("profiles").select("full_name,email,status").eq("id", item.recipient_profile_id).single(),
      ]);
      const mayReceiveWhileInactive = rule?.preference_category === "security";
      if (!rule || !recipient || (!mayReceiveWhileInactive && recipient.status !== "active") || !recipient.email) throw new Error("Recipient or automation rule is unavailable.");
      const values = templateValues(item, recipient);
      const subject = render(rule.subject_template, values);
      const message = render(rule.body_template, values);
      const actionLink = absoluteLink(values.reactivation_link || values.dashboard_link);
      const actionLabel = values.reactivation_link ? "Reactivate your account" : "Open secure dashboard";
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": item.unique_event_key }, body: JSON.stringify({ from: process.env.DISCOVER_BIBLE_SCHOOL_EMAIL_FROM, reply_to: process.env.DISCOVER_BIBLE_SCHOOL_EMAIL_REPLY_TO || undefined, to: [recipient.email], subject, html: htmlEmail(subject, message, actionLink, actionLabel), text: `${subject}\n\n${message}\n\n${actionLink}` }) });
      const provider = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(provider.message || "Resend rejected the email.");
      await supabase.from("email_notification_queue").update({ status: "sent", rendered_subject: subject, rendered_body: message, provider_message_id: provider.id || null, sent_at: new Date().toISOString(), failure_reason: null }).eq("id", item.id);
      await supabase.from("email_notification_logs").insert({ queue_id: item.id, automation_rule_id: item.automation_rule_id, event_type: item.event_type, recipient_profile_id: item.recipient_profile_id, recipient_role: item.recipient_role, recipient_email: recipient.email, provider_message_id: provider.id || null, delivery_status: "sent", attempt_number: item.attempt_count });
      results.push({ id: item.id, status: "sent" });
    } catch (failure) {
      const retry = item.attempt_count < item.maximum_attempts;
      const next = new Date(Date.now() + Math.pow(2, item.attempt_count) * 60_000).toISOString();
      await supabase.from("email_notification_queue").update(retry ? { status: "pending", scheduled_for: next, processing_started_at: null, failure_reason: String(failure.message || failure).slice(0, 1000) } : { status: "failed", failed_at: new Date().toISOString(), failure_reason: String(failure.message || failure).slice(0, 1000) }).eq("id", item.id);
      await supabase.from("email_notification_logs").insert({ queue_id: item.id, automation_rule_id: item.automation_rule_id, event_type: item.event_type, recipient_profile_id: item.recipient_profile_id, recipient_role: item.recipient_role, recipient_email: item.recipient_email, delivery_status: retry ? "retrying" : "failed", failure_reason: String(failure.message || failure).slice(0, 1000), attempt_number: item.attempt_count });
      results.push({ id: item.id, status: retry ? "retrying" : "failed" });
    }
  }
  return res.status(200).json({ inactivated: inactivated?.length ?? 0, processed: results.length, results });
}
