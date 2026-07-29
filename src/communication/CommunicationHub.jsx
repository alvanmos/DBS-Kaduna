import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRinging, CalendarPlus, DeviceMobile, Microphone, Phone, PhoneDisconnect,
  PhoneIncoming, Play, Radio, VideoCamera, WarningCircle, X, CheckCircle,
} from "@phosphor-icons/react";
import {
  cancelCommunicationMeeting, createRecordedMessage, endCommunicationCall,
  flushRecordedMessageQueue, loadCommunicationHub, recordedMessageUrl,
  respondToCommunicationCall, queueRecordedMessage, scheduleCommunicationMeeting,
  startCommunicationCall, subscribeToCommunication,
} from "./communicationRepository.js";

const MAX_RECORDING_SECONDS = 180;
const MAX_RECORDING_BYTES = 24 * 1024 * 1024;

function formatWhen(value) {
  return value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
}
function durationText(seconds) {
  const value = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

let ringToneContext = null;

function getRingToneContext() {
  if (ringToneContext?.state !== "closed") return ringToneContext;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  ringToneContext = AudioContextConstructor ? new AudioContextConstructor() : null;
  return ringToneContext;
}

function primeRingTone() {
  const context = getRingToneContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => {
      // The browser will allow another attempt after the next user interaction.
    });
  }
}

function startRingTone(kind) {
  const context = getRingToneContext();
  if (!context) return () => {};

  let intervalId = null;
  let stopped = false;
  const notes = kind === "incoming" ? [659, 784] : [440, 440];
  const repeatEvery = kind === "incoming" ? 1850 : 2050;

  function playNote(frequency, startAt) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.22);
  }

  function ring() {
    if (stopped || context.state !== "running") return;
    const now = context.currentTime + 0.02;
    notes.forEach((note, index) => playNote(note, now + index * 0.3));
  }

  function begin() {
    if (stopped) return;
    ring();
    if (!intervalId) intervalId = window.setInterval(ring, repeatEvery);
  }

  function unlockAndBegin() {
    void context.resume().then(begin).catch(() => {
      // A browser may delay sound until the next normal dashboard interaction.
    });
  }

  if (context.state === "running") begin();
  else {
    unlockAndBegin();
    window.addEventListener("pointerdown", unlockAndBegin, { once: true });
    window.addEventListener("keydown", unlockAndBegin, { once: true });
  }

  return () => {
    stopped = true;
    if (intervalId) window.clearInterval(intervalId);
    window.removeEventListener("pointerdown", unlockAndBegin);
    window.removeEventListener("keydown", unlockAndBegin);
  };
}

function JitsiRoom({ room, onEnd }) {
  const url = `https://meet.jit.si/${encodeURIComponent(room)}#config.prejoinConfig.enabled=false&config.disableDeepLinking=true&config.startWithAudioMuted=false`;
  return <div className="communication-room" role="dialog" aria-modal="true" aria-label="Online meeting">
    <div className="communication-room__bar"><span><Radio size={19} weight="fill" /> You are joining DBS Kaduna through the external Jitsi Meet service.</span><button type="button" onClick={onEnd}><PhoneDisconnect size={18} /> End call</button></div>
    <iframe title="DBS Kaduna online meeting" src={url} allow="camera; microphone; fullscreen; display-capture; autoplay" allowFullScreen />
  </div>;
}

function Recorder({ contacts, onSent, onNotice }) {
  const [recipientId, setRecipientId] = useState(contacts[0]?.id ?? "");
  const [mediaType, setMediaType] = useState("audio");
  const [status, setStatus] = useState("idle");
  const [preview, setPreview] = useState("");
  const [blob, setBlob] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef(null); const stream = useRef(null); const timer = useRef(null); const chunks = useRef([]);
  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach((track) => track.stop()); if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function clear() { clearInterval(timer.current); if (preview) URL.revokeObjectURL(preview); setPreview(""); setBlob(null); setElapsed(0); setStatus("idle"); }
  async function start() {
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mediaType === "video" });
      stream.current = nextStream; chunks.current = [];
      const nextRecorder = new MediaRecorder(nextStream, { mimeType: mediaType === "video" ? "video/webm" : "audio/webm" });
      recorder.current = nextRecorder;
      nextRecorder.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      nextRecorder.onstop = () => {
        const nextBlob = new Blob(chunks.current, { type: nextRecorder.mimeType });
        stream.current?.getTracks().forEach((track) => track.stop());
        if (nextBlob.size > MAX_RECORDING_BYTES) { onNotice("The recording is too large. Please make it shorter.", "error"); clear(); return; }
        setBlob(nextBlob); setPreview(URL.createObjectURL(nextBlob)); setStatus("preview");
      };
      nextRecorder.start(500); setStatus("recording"); const began = Date.now();
      timer.current = window.setInterval(() => { const seconds = Math.floor((Date.now() - began) / 1000); setElapsed(seconds); if (seconds >= MAX_RECORDING_SECONDS) nextRecorder.stop(); }, 250);
    } catch { onNotice("Camera or microphone permission was not granted. You can change this in your browser settings.", "error"); }
  }
  function stop() { clearInterval(timer.current); recorder.current?.state === "recording" && recorder.current.stop(); }
  async function send() {
    if (!blob || !recipientId) return;
    setStatus("sending");
    try {
      const payload = { recipientId, mediaType, blob, durationSeconds: elapsed };
      if (!navigator.onLine) { await queueRecordedMessage(payload); clear(); onNotice("You are offline. This recording is saved privately on this device and will upload when you reconnect.", "success"); return; }
      await onSent(payload); clear(); onNotice("Your recorded message was sent privately.", "success");
    } catch (error) { onNotice(error.message || "The recording could not be uploaded. Please try again.", "error"); setStatus("preview"); }
  }
  return <section className="communication-recorder"><div><p>Recorded message</p><h3>Send when you are ready</h3><span>Recording starts only after you press Record. Live calls are never recorded.</span></div><label>To<select value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.full_name}</option>)}</select></label><fieldset><legend>Message type</legend><button className={mediaType === "audio" ? "is-active" : ""} type="button" onClick={() => setMediaType("audio")}><Microphone size={18} />Audio</button><button className={mediaType === "video" ? "is-active" : ""} type="button" onClick={() => setMediaType("video")}><VideoCamera size={18} />Video</button></fieldset>{status === "recording" ? <div className="communication-recording"><i /> Recording {durationText(elapsed)} <button type="button" onClick={stop}>Stop</button></div> : status === "preview" || status === "sending" ? <><div className="communication-preview">{mediaType === "video" ? <video controls src={preview} /> : <audio controls src={preview} />}</div><div className="communication-actions"><button type="button" onClick={clear}>Delete & record again</button><button className="communication-action communication-action--primary" type="button" disabled={status === "sending"} onClick={send}>{status === "sending" ? "Uploading..." : "Send privately"}</button></div></> : <button className="communication-action communication-action--record" type="button" onClick={start}><Radio size={19} /> Record {mediaType} message</button>}<small>Maximum {Math.floor(MAX_RECORDING_SECONDS / 60)} minutes, 24 MB. Offline recordings remain on this device until connection returns.</small></section>;
}

export function CommunicationHub({ role }) {
  const [data, setData] = useState(null); const [notice, setNotice] = useState(null); const [activeCall, setActiveCall] = useState(null); const [isSchedulerOpen, setSchedulerOpen] = useState(false); const [schedule, setSchedule] = useState({ title: "Bible study session", description: "", start: "", end: "", type: "video", participants: [] }); const [online, setOnline] = useState(navigator.onLine);
  const isStudent = role === "student";
  function scheduleDatePart(value) { return value.split("T")[0] ?? ""; }
  function scheduleTimePart(value) { return value.split("T")[1]?.slice(0, 5) ?? ""; }
  function updateScheduleDateTime(field, part, value) {
    setSchedule((current) => {
      const date = part === "date" ? value : scheduleDatePart(current[field]);
      const time = part === "time" ? value : scheduleTimePart(current[field]);
      return { ...current, [field]: date || time ? `${date}T${time}` : "" };
    });
  }
  async function refresh() { try { setData(await loadCommunicationHub(role)); } catch (error) { setNotice({ text: error.message || "Communication is not available yet.", tone: "error" }); } }
  useEffect(() => { refresh(); const unsubscribe = subscribeToCommunication(refresh); const connected = async () => { setOnline(true); await flushRecordedMessageQueue(); setNotice({ text: "Connection restored. Any queued recordings are uploading privately.", tone: "success" }); refresh(); }; const disconnected = () => setOnline(false); window.addEventListener("online", connected); window.addEventListener("offline", disconnected); return () => { unsubscribe(); window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); }; }, []);
  useEffect(() => {
    const prepareSound = () => primeRingTone();
    window.addEventListener("pointerdown", prepareSound, { passive: true });
    window.addEventListener("keydown", prepareSound);
    return () => {
      window.removeEventListener("pointerdown", prepareSound);
      window.removeEventListener("keydown", prepareSound);
    };
  }, []);
  useEffect(() => { const accepted = data?.calls?.find((callRecord) => callRecord.caller_id === data?.settings?.profile_id && callRecord.status === "accepted"); if (accepted && !activeCall) setActiveCall(accepted); }, [activeCall, data]);
  const incoming = useMemo(() => (data?.calls ?? []).filter((call) => call.recipient_id === data?.settings?.profile_id && ["calling", "ringing"].includes(call.status)), [data]);
  const outgoing = useMemo(() => (data?.calls ?? []).filter((call) => call.caller_id === data?.settings?.profile_id && ["calling", "ringing"].includes(call.status)), [data]);
  const upcoming = useMemo(() => (data?.meetings ?? []).filter((meeting) => meeting.status === "scheduled" && new Date(meeting.scheduled_end) > new Date()), [data]);
  const missed = useMemo(() => (data?.calls ?? []).filter((call) => ["missed", "rejected"].includes(call.status)), [data]);
  const incomingCall = incoming[0]; const outgoingCall = outgoing[0]; const ringingCall = incomingCall ?? outgoingCall;
  useEffect(() => { if (!ringingCall) return undefined; return startRingTone(incomingCall ? "incoming" : "outgoing"); }, [incomingCall?.id, outgoingCall?.id]);
  async function call(contact, callType) { try { primeRingTone(); await startCommunicationCall({ recipientId: contact.id, callType }); setNotice({ text: `Calling ${contact.full_name}... Waiting for their response.`, tone: "success" }); await refresh(); } catch (error) { setNotice({ text: error.message, tone: "error" }); } }
  async function accept(callRecord) { try { const next = await respondToCommunicationCall({ callId: callRecord.id, action: "accepted" }); setActiveCall(next); await refresh(); } catch (error) { setNotice({ text: error.message, tone: "error" }); } }
  async function reject(callRecord) { await respondToCommunicationCall({ callId: callRecord.id, action: "rejected" }); await refresh(); }
  async function cancelCall(callRecord) { try { await endCommunicationCall(callRecord.id); setNotice({ text: "Call cancelled.", tone: "success" }); await refresh(); } catch (error) { setNotice({ text: error.message || "The call could not be cancelled.", tone: "error" }); } }
  async function closeRoom() { if (activeCall?.id) await endCommunicationCall(activeCall.id); setActiveCall(null); await refresh(); }
  async function submitSchedule(event) { event.preventDefault(); try { await scheduleCommunicationMeeting({ title: schedule.title, description: schedule.description, start: new Date(schedule.start).toISOString(), end: new Date(schedule.end).toISOString(), callType: schedule.type, participantIds: schedule.participants }); setSchedulerOpen(false); setNotice({ text: "Meeting invitation sent.", tone: "success" }); await refresh(); } catch (error) { setNotice({ text: error.message, tone: "error" }); } }
  if (!data) return <section className="portal-panel communication-hub"><p className="communication-loading">Loading secure communication...</p></section>;
  return <section className="portal-panel communication-hub" aria-labelledby="communication-heading">
    <div className="communication-head"><div><p>Communication</p><h2 id="communication-heading">Calls & study meetings</h2><span>{isStudent ? "Contact your assigned instructor privately." : "Securely contact only people connected to your DBS Kaduna role."}</span></div>{role !== "student" && <button className="communication-action communication-action--primary" type="button" onClick={() => setSchedulerOpen((value) => !value)}><CalendarPlus size={18} />Schedule meeting</button>}</div>
    {!online && <div className="communication-notice communication-notice--offline"><DeviceMobile size={19} /> You are offline. Live calls need internet; queued recordings will upload when you reconnect.</div>}
    {notice && <div className={`communication-notice communication-notice--${notice.tone}`}>{notice.tone === "error" ? <WarningCircle size={19} /> : <CheckCircle size={19} />}{notice.text}<button aria-label="Dismiss" type="button" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    {incomingCall && <div className="communication-incoming"><BellRinging size={22} weight="fill" /><div><strong>Incoming {incomingCall.call_type} call</strong><span>{incomingCall.caller_name || "DBS Kaduna contact"} is calling you. The ringing tone stops when you answer, decline, or the caller cancels.</span></div><button type="button" onClick={() => accept(incomingCall)}>Accept</button><button type="button" onClick={() => reject(incomingCall)}>Decline</button></div>}
    {outgoingCall && <div className="communication-outgoing" role="status"><Radio className="communication-call-pulse" size={21} weight="fill" /><div><strong>Calling {outgoingCall.other_party_name || "DBS Kaduna contact"}</strong><span>Ringing until they answer. You can cancel this call at any time.</span></div><button type="button" onClick={() => cancelCall(outgoingCall)}>Cancel call</button></div>}
    {role !== "student" && isSchedulerOpen && <form className="communication-scheduler" onSubmit={submitSchedule}><h3>Schedule an online meeting</h3><label>Title<input required value={schedule.title} onChange={(event) => setSchedule({ ...schedule, title: event.target.value })} /></label><label>Short description<textarea rows="2" value={schedule.description} onChange={(event) => setSchedule({ ...schedule, description: event.target.value })} /></label><div className="communication-scheduler__date-time"><label>Start date<input required type="date" value={scheduleDatePart(schedule.start)} onChange={(event) => updateScheduleDateTime("start", "date", event.target.value)} /></label><label>Start time<input required type="time" min="00:00" max="23:59" step="60" value={scheduleTimePart(schedule.start)} onChange={(event) => updateScheduleDateTime("start", "time", event.target.value)} /></label><label>End date<input required type="date" value={scheduleDatePart(schedule.end)} onChange={(event) => updateScheduleDateTime("end", "date", event.target.value)} /></label><label>End time<input required type="time" min="00:00" max="23:59" step="60" value={scheduleTimePart(schedule.end)} onChange={(event) => updateScheduleDateTime("end", "time", event.target.value)} /></label></div><label>Format<select value={schedule.type} onChange={(event) => setSchedule({ ...schedule, type: event.target.value })}><option value="video">Video</option><option value="audio">Audio</option></select></label><fieldset><legend>Invite eligible contacts</legend>{data.contacts.map((contact) => <label key={contact.id}><input type="checkbox" checked={schedule.participants.includes(contact.id)} onChange={(event) => setSchedule({ ...schedule, participants: event.target.checked ? [...schedule.participants, contact.id] : schedule.participants.filter((id) => id !== contact.id) })} />{contact.full_name}</label>)}</fieldset><div className="communication-actions"><button type="button" onClick={() => setSchedulerOpen(false)}>Cancel</button><button className="communication-action communication-action--primary" type="submit">Send invitation</button></div></form>}
    <div className="communication-contact-grid">{data.contacts.length ? data.contacts.map((contact) => <article key={contact.id}><span className="communication-avatar">{contact.full_name?.slice(0, 1)}</span><div><strong>{contact.full_name}</strong><small>{isStudent ? "Your assigned instructor" : contact.contact_role === "admin" ? "DBS Kaduna support" : "Your assigned instructor / student"}</small></div><div className="communication-contact-actions"><button type="button" onClick={() => call(contact, "audio")} aria-label={`Start an audio call with ${contact.full_name}`}><Phone size={19} />Audio</button><button type="button" onClick={() => call(contact, "video")} aria-label={`Start a video call with ${contact.full_name}`}><VideoCamera size={19} />Video</button>{contact.phone && contact.allow_phone_fallback && <a href={`tel:${contact.phone}`}><Phone size={18} />Phone</a>}{contact.phone && contact.allow_sms_fallback && <a href={`sms:${contact.phone}`}><DeviceMobile size={18} />SMS</a>}</div></article>) : <div className="portal-empty">{isStudent ? "Your assigned instructor will appear here once one is assigned." : "There is no eligible contact yet."}</div>}</div>
    <div className="communication-columns"><section><h3>Upcoming meetings</h3>{upcoming.length ? upcoming.map((meeting) => <article className="communication-list-item" key={meeting.id}><div><strong>{meeting.title}</strong><small>{formatWhen(meeting.scheduled_start)} Â· {meeting.call_type}</small></div><button type="button" onClick={() => setActiveCall({ meeting_room: meeting.meeting_room, id: null })}>Join</button>{meeting.created_by === data.settings.profile_id && <button type="button" onClick={() => cancelCommunicationMeeting(meeting.id).then(refresh)}>Cancel</button>}</article>) : <p className="communication-empty">No upcoming meetings.</p>}</section><section><h3>Recent calls</h3>{data.calls.length ? data.calls.slice(0, 5).map((callRecord) => <article className="communication-list-item" key={callRecord.id}><div><strong>{callRecord.other_party_name || "DBS Kaduna contact"}</strong><small>{callRecord.call_type} Â· {callRecord.status} Â· {formatWhen(callRecord.created_at)}</small></div><span className={`communication-status communication-status--${callRecord.status}`}>{callRecord.status}</span></article>) : <p className="communication-empty">No calls yet.</p>}</section></div>
    {data.messages.length > 0 && <section className="communication-recordings"><h3>Recorded messages</h3>{data.messages.map((message) => <article className="communication-list-item" key={message.id}><div><strong>{message.media_type === "video" ? "Video" : "Audio"} message</strong><small>{durationText(message.duration_seconds)} Â· {formatWhen(message.created_at)}</small></div>{message.status === "uploaded" ? <button type="button" onClick={() => recordedMessageUrl(message.storage_path).then((url) => window.open(url, "_blank", "noopener,noreferrer"))}><Play size={16} />Play</button> : <span className="communication-status">{message.status.replaceAll("_", " ")}</span>}</article>)}</section>}
    {missed.length > 0 && <p className="communication-missed"><PhoneIncoming size={18} /> {missed.length} missed or declined call{missed.length === 1 ? "" : "s"} in your history.</p>}
    <Recorder contacts={data.contacts} onSent={createRecordedMessage} onNotice={(text, tone) => setNotice({ text, tone })} />
    {activeCall?.meeting_room && <JitsiRoom room={activeCall.meeting_room} onEnd={closeRoom} />}
  </section>;
}
