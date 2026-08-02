import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ZOOM_API = "https://api.zoom.us/v2";
const ZOOM_OAUTH = "https://zoom.us/oauth";
const REQUESTS = new Map();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function serviceClient() {
  return createClient(required("VITE_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function json(res, status, payload) {
  res.status(status).json(payload);
}

export function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    json(res, 405, { error: "Method not allowed." });
    return false;
  }
  return true;
}

export function rateLimit(req, res, bucket, limit = 40, windowMs = 60_000) {
  const key = `${bucket}:${req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"}`;
  const now = Date.now();
  const recent = (REQUESTS.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
    json(res, 429, { error: "Too many requests. Please try again shortly." });
    return false;
  }
  recent.push(now);
  REQUESTS.set(key, recent);
  return true;
}

export async function authenticated(req, permittedRoles = []) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Authentication required.");
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Your login has expired. Please sign in again.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,status,full_name,email")
    .eq("id", data.user.id)
    .single();
  if (profileError || profile?.status !== "active" || (permittedRoles.length && !permittedRoles.includes(profile.role))) {
    throw new Error("You do not have permission to perform this action.");
  }
  return { supabase, user: data.user, profile, token };
}

export async function instructorForProfile(supabase, profileId) {
  const { data, error } = await supabase.from("instructors").select("id,profile_id,status").eq("profile_id", profileId).eq("status", "active").single();
  if (error || !data) throw new Error("An active instructor account is required.");
  return data;
}

function encryptionKey() {
  const raw = required("ZOOM_TOKEN_ENCRYPTION_KEY").trim();
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ZOOM_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex value.");
  return key;
}

export function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decrypt(value) {
  const raw = Buffer.from(value, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

function stateKey() {
  return crypto.createHash("sha256").update(required("ZOOM_TOKEN_ENCRYPTION_KEY")).digest();
}

export function createOAuthState(profileId) {
  const payload = Buffer.from(JSON.stringify({ profileId, exp: Date.now() + 10 * 60_000, nonce: crypto.randomUUID() })).toString("base64url");
  const signature = crypto.createHmac("sha256", stateKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readOAuthState(state) {
  const [payload, signature] = String(state || "").split(".");
  const expected = crypto.createHmac("sha256", stateKey()).update(payload || "").digest("base64url");
  if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("The Zoom connection link is invalid or has expired.");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!parsed.profileId || parsed.exp < Date.now()) throw new Error("The Zoom connection link has expired. Please try again.");
  return parsed;
}

export function zoomAuthorizeUrl(state) {
  const params = new URLSearchParams({ response_type: "code", client_id: required("ZOOM_CLIENT_ID"), redirect_uri: required("ZOOM_REDIRECT_URI"), state });
  return `${ZOOM_OAUTH}/authorize?${params}`;
}

async function oauthToken(params) {
  const credentials = Buffer.from(`${required("ZOOM_CLIENT_ID")}:${required("ZOOM_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(`${ZOOM_OAUTH}/token`, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.reason || body.error_description || "Zoom authorization failed.");
  return body;
}

export async function exchangeCode(code) { return oauthToken({ grant_type: "authorization_code", code, redirect_uri: required("ZOOM_REDIRECT_URI") }); }

async function refreshToken(refresh) { return oauthToken({ grant_type: "refresh_token", refresh_token: refresh }); }

export async function zoomAccountToken(supabase, account) {
  let accessToken = decrypt(account.access_token_encrypted);
  if (new Date(account.token_expires_at).getTime() > Date.now() + 60_000) return accessToken;
  const next = await refreshToken(decrypt(account.refresh_token_encrypted));
  accessToken = next.access_token;
  const { error } = await supabase.from("zoom_accounts").update({ access_token_encrypted: encrypt(next.access_token), refresh_token_encrypted: encrypt(next.refresh_token), token_expires_at: new Date(Date.now() + Number(next.expires_in || 3600) * 1000).toISOString(), connection_status: "connected", connection_error: null }).eq("id", account.id);
  if (error) throw error;
  return accessToken;
}

export async function zoomFetch(path, accessToken, options = {}) {
  const response = await fetch(`${ZOOM_API}${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Zoom could not complete this operation.");
  return body;
}

export async function audit(supabase, profileId, action, entityType, entityId, details = {}) {
  await supabase.from("zoom_audit_log").insert({ actor_profile_id: profileId, action, entity_type: entityType, entity_id: entityId, details });
}

export async function recordOperationFailure(supabase, profileId, operation, error, classId = null) {
  await supabase.from("zoom_operation_errors").insert({ instructor_profile_id: profileId, zoom_class_id: classId, operation, error_message: String(error?.message || error).slice(0, 1000) });
}

export function lagosTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) throw new Error("Choose a valid Nigerian date and time.");
  return new Date(`${date}T${time}:00+01:00`);
}
