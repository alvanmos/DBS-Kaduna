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
  hasPassword,
  onCreatePassword,
  onSignIn,
}) {
  const [email, setEmail] = useState(adminEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!hasPassword) {
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
    if (hasPassword) {
      const signInError = await onSignIn(email, password);
      setError(signInError);
    } else {
      await onCreatePassword(password);
    }
    setIsSubmitting(false);
  }

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
          {hasPassword ? "Welcome back" : "Set up the admin account"}
        </h1>
        <p className="admin-auth-intro">
          {hasPassword
            ? "Sign in to manage students, instructors, lessons, certificates, reports, and news."
            : "Create the initial password for the registered administrator account on this browser."}
        </p>

        <form className="admin-auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Administrator email</span>
            <span className="admin-input-wrap">
              <EnvelopeSimple aria-hidden="true" size={20} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                readOnly={!hasPassword}
                autoComplete="username"
                required
              />
            </span>
          </label>

          <label>
            <span>{hasPassword ? "Password" : "Create password"}</span>
            <span className="admin-input-wrap">
              <LockKey aria-hidden="true" size={20} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={hasPassword ? "current-password" : "new-password"}
                minLength={hasPassword ? undefined : 10}
                required
              />
            </span>
          </label>

          {!hasPassword && (
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

          {error && <p className="admin-form-error">{error}</p>}

          <button className="admin-primary-button admin-auth-submit" type="submit">
            {isSubmitting
              ? "Please wait..."
              : hasPassword
                ? "Sign in to dashboard"
                : "Create password and continue"}
          </button>
        </form>

        <aside className="admin-security-note">
          <ShieldCheck aria-hidden="true" size={22} />
          <p>
            This prototype stores only a one-way password hash in this browser.
            Production email delivery and multi-device login require a secure
            server-side authentication and email service.
          </p>
        </aside>
      </section>
    </main>
  );
}
