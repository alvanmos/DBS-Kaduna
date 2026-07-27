import { supabase } from "../lib/supabase.js";

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

function fallbackError(error) {
  if (error?.code === "42P01" || error?.code === "PGRST202" || error?.message?.includes("schema cache")) {
    return new Error("Communication is being enabled. Please try again shortly.");
  }
  return error;
}

async function rpc(name, params = {}) {
  try {
    return unwrap(await supabase.rpc(name, params));
  } catch (error) {
    throw fallbackError(error);
  }
}

export async function loadCommunicationHub(role) {
  const [contacts, calls, meetings, messages, settings] = await Promise.all([
    rpc("communication_my_contacts"),
    rpc("communication_my_calls"),
    rpc("communication_my_meetings"),
    rpc("communication_my_recorded_messages"),
    rpc("communication_my_settings"),
  ]);
  const visibleContacts = (contacts ?? []).filter(
    (contact) => role !== "student" || contact.contact_role === "instructor",
  );
  return { contacts: visibleContacts, calls: calls ?? [], meetings: meetings ?? [], messages: messages ?? [], settings: settings ?? {} };
}

export async function startCommunicationCall({ recipientId, callType }) {
  const room = `dbs-${crypto.randomUUID().replaceAll("-", "")}`;
  return rpc("communication_start_call", {
    input_recipient_id: recipientId,
    input_call_type: callType,
    input_meeting_room: room,
  });
}

export async function respondToCommunicationCall({ callId, action }) {
  return rpc("communication_respond_to_call", { input_call_id: callId, input_action: action });
}

export async function endCommunicationCall(callId) {
  return rpc("communication_end_call", { input_call_id: callId });
}

export async function scheduleCommunicationMeeting({ title, description, start, end, callType, participantIds }) {
  const room = `dbs-${crypto.randomUUID().replaceAll("-", "")}`;
  return rpc("communication_schedule_meeting", {
    input_title: title,
    input_description: description || null,
    input_scheduled_start: start,
    input_scheduled_end: end,
    input_call_type: callType,
    input_meeting_room: room,
    input_participant_ids: participantIds,
  });
}

export async function cancelCommunicationMeeting(meetingId) {
  return rpc("communication_cancel_meeting", { input_meeting_id: meetingId });
}

export async function createRecordedMessage({ recipientId, mediaType, blob, durationSeconds }) {
  const extension = mediaType === "video" ? "webm" : "webm";
  const path = `${(await supabase.auth.getUser()).data.user.id}/${crypto.randomUUID()}.${extension}`;
  const message = await rpc("communication_create_recorded_message", {
    input_recipient_id: recipientId,
    input_media_type: mediaType,
    input_storage_path: path,
    input_duration_seconds: Math.round(durationSeconds),
    input_file_size: blob.size,
  });
  unwrap(await supabase.storage.from("communication-recordings").upload(path, blob, {
    contentType: blob.type || `${mediaType}/webm`,
    upsert: false,
  }));
  await rpc("communication_mark_recorded_message_uploaded", { input_message_id: message.id });
  return message;
}

const queueDbName = "dbs-communication-queue";
const queueStoreName = "recordings";

function queueDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(queueDbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(queueStoreName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueRecordedMessage(message) {
  const db = await queueDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(queueStoreName, "readwrite");
    transaction.objectStore(queueStoreName).put({ ...message, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function flushRecordedMessageQueue() {
  const db = await queueDatabase();
  const queued = await new Promise((resolve, reject) => {
    const request = db.transaction(queueStoreName, "readonly").objectStore(queueStoreName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const message of queued) {
    try {
      await createRecordedMessage(message);
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(queueStoreName, "readwrite");
        transaction.objectStore(queueStoreName).delete(message.id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      // Keep the private local copy and try again after the next reconnection.
    }
  }
  db.close();
}

export async function recordedMessageUrl(storagePath) {
  return unwrap(await supabase.storage.from("communication-recordings").createSignedUrl(storagePath, 10 * 60)).signedUrl;
}

export function subscribeToCommunication(onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel("dbs-communications")
    .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "meeting_participants" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "recorded_messages" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
