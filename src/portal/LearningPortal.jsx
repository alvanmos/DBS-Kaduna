import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  GraduationCap,
  LockKey,
  User,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { getAuthFlowType, isSupabaseConfigured, supabase } from "../lib/supabase.js";
import { StudentDashboard } from "./StudentDashboard.jsx";
import { InstructorDashboard } from "./InstructorDashboard.jsx";
import { resolveLoginIdentifier } from "./portalRepository.js";
import "./portal.css";

const roleConfig = {
  student: {
    label: "Student",
    loginPath: "/login/student",
    dashboardPath: "/student",
    Icon: GraduationCap,
  },
  instructor: {
    label: "Instructor",
    loginPath: "/login/instructor",
    dashboardPath: "/instructor",
    Icon: UsersThree,
  },
};

function friendlyError(error) {
  if (!error) return "";
  if (error.message?.toLowerCase().includes("invalid login credentials")) {
    return "The username, email, or password is incorrect.";
  }
  return error.message || "Authentication could not be completed.";
}

function RoleLogin({ role, mode, message, onSignIn, onSetPassword, onReset }) {
  const config = roleConfig[role];
  const Icon = config.Icon;
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const isSetup = mode === "set-password";
  const isUnavailable = mode === "configuration-error";

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (isSetup && (password.length < 10 || password !== confirmPassword)) {
      setError(
        password.length < 10
          ? "Create a password with at least 10 characters."
          : "The password confirmation does not match.",
      );
      return;
    }
    setBusy(true);
    const result = isSetup
      ? await onSetPassword(password)
      : await onSignIn(identity, password);
    setError(result);
    setBusy(false);
  }

  async function resetPassword() {
    if (!identity.trim()) {
      setError("Enter your username or email first.");
      return;
    }
    setBusy(true);
    const result = await onReset(identity);
    setBusy(false);
    if (result) setError(result);
    else setNotice("A secure password-reset link has been sent to your email.");
  }

  return (
    <main className="portal-auth-shell">
      <a href="/" className="portal-back-link">
        <ArrowLeft aria-hidden="true" size={18} />
        Return to homepage
      </a>
      <section className="portal-auth-card">
        <img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" />
        <span className="portal-auth-icon"><Icon aria-hidden="true" size={34} weight="duotone" /></span>
        <p>DBS Kaduna {config.label}</p>
        <h1>
          {isUnavailable
            ? "Secure login unavailable"
            : isSetup
              ? "Create your secure password"
              : `${config.label} login`}
        </h1>
        <span>
          {isUnavailable
            ? "The Supabase connection is not configured for this deployment."
            : isSetup
            ? "Your invitation is verified. Create the password you will use for future access."
            : `Sign in to your ${config.label.toLowerCase()} learning dashboard with your username and password.`}
        </span>
        {!isUnavailable && <form onSubmit={submit}>
          {!isSetup && (
            <label>
              Username or email
              <span><User aria-hidden="true" size={20} /><input type="text" value={identity} onChange={(event) => setIdentity(event.target.value)} autoComplete="username" required /></span>
            </label>
          )}
          <label>
            {isSetup ? "Create password" : "Password"}
            <span><LockKey aria-hidden="true" size={20} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSetup ? "new-password" : "current-password"} required /></span>
          </label>
          {isSetup && (
            <label>
              Confirm password
              <span><CheckCircle aria-hidden="true" size={20} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></span>
            </label>
          )}
          {(error || message) && <div className="portal-auth-message is-error"><WarningCircle aria-hidden="true" size={20} />{error || message}</div>}
          {notice && <div className="portal-auth-message is-success"><CheckCircle aria-hidden="true" size={20} />{notice}</div>}
          <button type="submit" disabled={busy}>{busy ? "Please wait..." : isSetup ? "Save password and continue" : "Sign in"}</button>
          {!isSetup && <button className="portal-reset" type="button" onClick={resetPassword} disabled={busy}>Forgot your password?</button>}
        </form>}
      </section>
    </main>
  );
}

export function LearningPortal({ role }) {
  const config = roleConfig[role];
  const initialFlow = getAuthFlowType();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(
    isSupabaseConfigured ? "loading" : "configuration-error",
  );
  const [message, setMessage] = useState("");
  const [needsPassword, setNeedsPassword] = useState(
    initialFlow === "invite" || initialFlow === "recovery",
  );

  useEffect(() => {
    document.title = `${config.label} Dashboard | DBS Kaduna`;
  }, [config.label]);

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;

    async function verify(currentSession) {
      if (!mounted) return;
      if (!currentSession) {
        setSession(null);
        setProfile(null);
        setStatus("sign-in");
        return;
      }
      setSession(currentSession);
      if (needsPassword) {
        setStatus("set-password");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentSession.user.id)
        .single();
      if (!mounted) return;
      if (error || data?.role !== role || data?.status !== "active") {
        await supabase.auth.signOut();
        setMessage(`This account does not have active ${config.label.toLowerCase()} access.`);
        setStatus("sign-in");
        return;
      }
      setProfile(data);
      setStatus("authenticated");
      window.history.replaceState({}, "", config.dashboardPath);
    }

    supabase.auth.getSession().then(({ data }) => verify(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setNeedsPassword(true);
        setSession(currentSession);
        setStatus("set-password");
      } else {
        window.setTimeout(() => verify(currentSession), 0);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [config.dashboardPath, config.label, needsPassword, role]);

  async function signIn(identifier, password) {
    setMessage("");
    try {
      const email = await resolveLoginIdentifier(role, identifier);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      return friendlyError(error);
    } catch (error) {
      return friendlyError(error);
    }
  }

  async function setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return friendlyError(error);
    setNeedsPassword(false);
    window.history.replaceState({}, "", config.dashboardPath);
    return "";
  }

  async function resetPassword(identifier) {
    try {
      const email = await resolveLoginIdentifier(role, identifier);
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}${config.loginPath}?type=recovery`,
        },
      );
      return friendlyError(error);
    } catch (error) {
      return friendlyError(error);
    }
  }

  async function signOut(redirectPath = config.loginPath) {
    const targetPath =
      typeof redirectPath === "string" ? redirectPath : config.loginPath;
    await supabase.auth.signOut();
    window.location.replace(targetPath);
  }

  if (status === "loading") {
    return <main className="portal-loading"><img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" /><p>Loading your secure dashboard...</p></main>;
  }
  if (status !== "authenticated") {
    return (
      <RoleLogin
        role={role}
        mode={status}
        message={status === "configuration-error" ? "Secure login is not configured." : message}
        onSignIn={signIn}
        onSetPassword={setPassword}
        onReset={resetPassword}
      />
    );
  }
  return role === "student" ? (
    <StudentDashboard
      profile={profile}
      onSignOut={signOut}
      onDeleteAccount={() => signOut("/")}
    />
  ) : (
    <InstructorDashboard profile={profile} onSignOut={signOut} />
  );
}
