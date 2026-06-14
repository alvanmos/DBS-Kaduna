import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react";

export function AdminLogin({
  adminEmail,
  mode,
  statusMessage,
  onSetPassword,
  onSignIn,
  onRequestPasswordReset,
}) {
  const [email, setEmail] = useState(adminEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "set-password") {
      if (password.length < 10) {
        setError("Create a password with at least 10 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The password confirmation does not match.");
        return;
      }
    }

    setIsSubmitting(true);
    if (mode === "sign-in") {
      const signInError = await onSignIn(email, password);
      setError(signInError);
    } else {
      const setupError = await onSetPassword(password);
      setError(setupError);
    }
    setIsSubmitting(false);
  }

  async function handlePasswordReset() {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter the administrator email address first.");
      return;
    }
    setIsSubmitting(true);
    const resetError = await onRequestPasswordReset(email);
    if (resetError) {
      setError(resetError);
    } else {
      setNotice("A secure password-reset link has been sent by email.");
    }
    setIsSubmitting(false);
  }

  const isPasswordSetup = mode === "set-password";
  const isUnavailable = mode === "configuration-error";

  return (
    <main className="admin-auth-shell">
      <a className="admin-back-link" href="/">
        <ArrowLeft aria-hidden="true" size={18} weight="bold" />
        Return to homepage
      </a>

      <section className="admin-auth-card" aria-labelledby="admin-login-heading">
        <div className="admin-auth-brand">
          <img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" />
          <span>
            <strong>Discover Bible School</strong>
            <small>Kaduna Administration</small>
          </span>
        </div>

        <div className="admin-auth-icon">
          <ShieldCheck aria-hidden="true" size={36} weight="duotone" />
        </div>
        <p className="admin-kicker">Secure administration</p>
        <h1 id="admin-login-heading">
          {isUnavailable
            ? "Secure login unavailable"
            : isPasswordSetup
              ? "Create your secure password"
              : "Welcome back"}
        </h1>
        <p className="admin-auth-intro">
          {isUnavailable
            ? "The Supabase connection is not configured for this deployment."
            : isPasswordSetup
              ? "Your invitation has been verified. Choose the password you will use for future administrator sign-ins."
              : "Sign in to manage students, instructors, lessons, certificates, reports, and news."}
        </p>

        {!isUnavailable && (
          <form className="admin-auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Administrator email</span>
              <span className="admin-input-wrap">
                <EnvelopeSimple aria-hidden="true" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  readOnly={isPasswordSetup}
                  autoComplete="username"
                  required
                />
              </span>
            </label>

            <label>
              <span>{isPasswordSetup ? "Create password" : "Password"}</span>
              <span className="admin-input-wrap">
                <LockKey aria-hidden="true" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    isPasswordSetup ? "new-password" : "current-password"
                  }
                  minLength={isPasswordSetup ? 10 : undefined}
                  required
                />
              </span>
            </label>

            {isPasswordSetup && (
              <label>
                <span>Confirm password</span>
                <span className="admin-input-wrap">
                  <CheckCircle aria-hidden="true" size={20} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </span>
              </label>
            )}

            {(error || statusMessage) && (
              <p className="admin-form-error">{error || statusMessage}</p>
            )}
            {notice && <p className="admin-form-notice">{notice}</p>}

            <button
              className="admin-primary-button admin-auth-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Please wait..."
                : isPasswordSetup
                  ? "Save password and continue"
                  : "Sign in to dashboard"}
            </button>
            {!isPasswordSetup && (
              <button
                className="admin-auth-reset"
                type="button"
                onClick={handlePasswordReset}
                disabled={isSubmitting}
              >
                Forgot your password?
              </button>
            )}
          </form>
        )}

        <aside className="admin-security-note">
          <ShieldCheck aria-hidden="true" size={22} />
          <p>
            Authentication is handled by Supabase. Passwords are never stored in
            this website or sent by email, and administrator access is verified
            against the protected database role.
          </p>
        </aside>
      </section>
    </main>
  );
}
