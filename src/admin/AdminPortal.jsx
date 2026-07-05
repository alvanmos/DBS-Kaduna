import React, { useEffect, useState } from "react";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { AdminLogin } from "./AdminLogin.jsx";
import { ADMIN_EMAIL } from "./adminData.js";
import {
  addQuestion,
  approveInstructor,
  assignStudentInstructor,
  clearRegistrationData,
  createRecruitmentCampaign,
  deleteRecruitmentCampaign,
  deleteNews,
  deleteQuestion,
  getEmptyAdminData,
  issueCertificate,
  loadAdminData,
  moveQuestion,
  publishNews,
  saveRegistrationForm,
  sendAdminMessageToInstructor,
  updateInstructor,
  uploadCertificatePdf,
  uploadLessonPdf,
} from "./adminRepository.js";
import {
  getAuthFlowType,
  isSupabaseConfigured,
  supabase,
} from "../lib/supabase.js";
import "./admin.css";

const initialFlowType = getAuthFlowType();

function cleanAuthUrl(path = "/login/admin") {
  window.history.replaceState({}, "", path);
}

function friendlyAuthError(error) {
  if (!error) return "";
  if (error.message?.toLowerCase().includes("invalid login credentials")) {
    return "The email address or password is incorrect.";
  }
  if (error.message?.toLowerCase().includes("email not confirmed")) {
    return "Confirm the email invitation before signing in.";
  }
  return error.message || "Authentication could not be completed.";
}

export function AdminPortal() {
  const [data, setData] = useState(getEmptyAdminData);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(
    isSupabaseConfigured ? "loading" : "configuration-error",
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(
    initialFlowType === "invite" || initialFlowType === "recovery",
  );

  useEffect(() => {
    document.title =
      status === "authenticated"
        ? "Admin Dashboard | DBS Kaduna"
        : "Admin Login | DBS Kaduna";
  }, [status]);

  useEffect(() => {
    if (!supabase) return undefined;
    let isMounted = true;

    async function refreshData() {
      const adminData = await loadAdminData();
      if (isMounted) setData(adminData);
      return adminData;
    }

    async function verifyAdmin(currentSession) {
      if (!currentSession) {
        if (!isMounted) return;
        setSession(null);
        setProfile(null);
        setStatus("sign-in");
        return;
      }

      if (!isMounted) return;
      setSession(currentSession);

      if (requiresPasswordSetup) {
        setStatus("set-password");
        return;
      }

      const { data: adminProfile, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, status")
        .eq("id", currentSession.user.id)
        .single();

      if (!isMounted) return;
      if (
        error ||
        adminProfile?.role !== "admin" ||
        adminProfile?.status !== "active"
      ) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setStatusMessage(
          "This account does not have active administrator permission.",
        );
        setStatus("sign-in");
        return;
      }

      setProfile(adminProfile);
      setStatusMessage("");
      try {
        await refreshData();
        if (!isMounted) return;
        setStatus("authenticated");
      } catch (dataError) {
        setStatusMessage(
          dataError.message || "The secure dashboard data could not be loaded.",
        );
        setStatus("sign-in");
        return;
      }
      cleanAuthUrl("/admin");
    }

    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!isMounted) return;
      if (error) {
        setStatusMessage(friendlyAuthError(error));
        setStatus("sign-in");
        return;
      }
      verifyAdmin(sessionData.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setRequiresPasswordSetup(true);
        setSession(currentSession);
        setStatus("set-password");
        return;
      }
      window.setTimeout(() => verifyAdmin(currentSession), 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [requiresPasswordSetup]);

  async function signIn(email, password) {
    setStatusMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return friendlyAuthError(error);
  }

  async function setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return friendlyAuthError(error);

    setRequiresPasswordSetup(false);
    cleanAuthUrl("/admin");
    return "";
  }

  async function requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/login/admin?type=recovery`,
      },
    );
    return friendlyAuthError(error);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setStatus("sign-in");
    cleanAuthUrl("/login/admin");
  }

  async function runAction(action) {
    const result = await action();
    setData(await loadAdminData());
    return result;
  }

  const actions = {
    assignStudent: (studentId, instructorId) =>
      runAction(() => assignStudentInstructor(studentId, instructorId)),
    approveInstructor: (instructor, maxLoad) =>
      runAction(() => approveInstructor(instructor, maxLoad)),
    updateInstructor: (instructorId, changes) =>
      runAction(() => updateInstructor(instructorId, changes)),
    uploadLesson: (lessonNumber, file) =>
      runAction(() => uploadLessonPdf(lessonNumber, file)),
    addQuestion: (question) => runAction(() => addQuestion(question)),
    moveQuestion: (questionId, direction) =>
      runAction(() => moveQuestion(questionId, direction)),
    deleteQuestion: (questionId) =>
      runAction(() => deleteQuestion(questionId)),
    issueCertificate: (studentId) =>
      runAction(() => issueCertificate(studentId)),
    uploadCertificatePdf: (studentId, file) =>
      runAction(() => uploadCertificatePdf(studentId, file)),
    createRecruitmentCampaign: (campaign) =>
      runAction(() => createRecruitmentCampaign(campaign)),
    deleteRecruitmentCampaign: (campaignId) =>
      runAction(() => deleteRecruitmentCampaign(campaignId)),
    saveRegistrationForm: (form) =>
      runAction(() => saveRegistrationForm(form)),
    sendAdminMessage: (instructorId, body) =>
      runAction(() => sendAdminMessageToInstructor(instructorId, body)),
    publishNews: (newsItem) => runAction(() => publishNews(newsItem)),
    deleteNews: (newsItem) => runAction(() => deleteNews(newsItem)),
    clearRegistrationData: () => runAction(() => clearRegistrationData()),
  };

  if (status === "loading") {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card admin-auth-card--loading">
          <img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" />
          <p>Checking your secure administrator session...</p>
        </section>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <AdminLogin
        adminEmail={session?.user?.email ?? ADMIN_EMAIL}
        mode={status}
        statusMessage={statusMessage}
        onSetPassword={setPassword}
        onSignIn={signIn}
        onRequestPasswordReset={requestPasswordReset}
      />
    );
  }

  return (
    <AdminDashboard
      adminProfileId={profile?.id ?? ""}
      adminEmail={profile?.email ?? session?.user?.email ?? ADMIN_EMAIL}
      data={data}
      actions={actions}
      onSignOut={signOut}
    />
  );
}
