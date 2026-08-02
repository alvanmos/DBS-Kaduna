import { supabase } from "../lib/supabase.js";

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}`, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Zoom is temporarily unavailable.");
  return payload;
}
export const loadZoomClasses = () => request("/api/zoom/classes");
export const loadZoomAccount = () => request("/api/zoom/account");
export const connectZoomAccount = () => request("/api/zoom/connect", { method: "POST" });
export const disconnectZoomAccount = () => request("/api/zoom/account", { method: "DELETE" });
export const createZoomClass = (body) => request("/api/zoom/classes", { method: "POST", body: JSON.stringify(body) });
export const updateZoomClass = (body) => request("/api/zoom/classes", { method: "PATCH", body: JSON.stringify(body) });
export const cancelZoomClass = (classId) => request("/api/zoom/classes", { method: "DELETE", body: JSON.stringify({ classId }) });
export const joinZoomClass = (classId) => request("/api/zoom/join", { method: "POST", body: JSON.stringify({ classId }) });
export const loadZoomAdmin = (filters = {}) => { const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)); return request(`/api/zoom/admin?${params}`); };
export const adminZoomClassAction = (classId, action) => request("/api/zoom/admin", { method: "POST", body: JSON.stringify({ classId, action }) });
export async function downloadZoomCsv(filters = {}) { const { data } = await supabase.auth.getSession(); const params = new URLSearchParams({ ...filters, format: "csv" }); const response = await fetch(`/api/zoom/admin?${params}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` } }); if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Export failed."); } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "zoom-class-attendance.csv"; link.click(); URL.revokeObjectURL(url); }
