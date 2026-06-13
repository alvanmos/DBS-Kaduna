import React, { useEffect, useState } from "react";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { AdminLogin } from "./AdminLogin.jsx";
import { ADMIN_EMAIL, createInitialAdminData } from "./adminData.js";
import "./admin.css";

const DATA_KEY = "dbs-kaduna-admin-data-v1";
const PASSWORD_KEY = "dbs-kaduna-admin-password-v1";
const SESSION_KEY = "dbs-kaduna-admin-session";

function readStoredData() {
  try {
    const stored = window.localStorage.getItem(DATA_KEY);
    return stored ? JSON.parse(stored) : createInitialAdminData();
  } catch {
    return createInitialAdminData();
  }
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(`dbs-kaduna:${password}`);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function AdminPortal() {
  const [data, setData] = useState(readStoredData);
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => window.sessionStorage.getItem(SESSION_KEY) === "active",
  );
  const [hasPassword, setHasPassword] = useState(
    () => Boolean(window.localStorage.getItem(PASSWORD_KEY)),
  );

  useEffect(() => {
    document.title = isAuthenticated
      ? "Admin Dashboard | DBS Kaduna"
      : "Admin Login | DBS Kaduna";
  }, [isAuthenticated]);

  useEffect(() => {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }, [data]);

  async function createPassword(password) {
    const passwordHash = await hashPassword(password);
    window.localStorage.setItem(PASSWORD_KEY, passwordHash);
    window.sessionStorage.setItem(SESSION_KEY, "active");
    setHasPassword(true);
    setIsAuthenticated(true);
    window.history.replaceState({}, "", "/admin");
  }

  async function signIn(email, password) {
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      return "Use the registered administrator email.";
    }

    const storedHash = window.localStorage.getItem(PASSWORD_KEY);
    const suppliedHash = await hashPassword(password);
    if (!storedHash || suppliedHash !== storedHash) {
      return "The password is incorrect.";
    }

    window.sessionStorage.setItem(SESSION_KEY, "active");
    setIsAuthenticated(true);
    window.history.replaceState({}, "", "/admin");
    return "";
  }

  function signOut() {
    window.sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
    window.history.replaceState({}, "", "/login/admin");
  }

  if (!isAuthenticated) {
    return (
      <AdminLogin
        adminEmail={ADMIN_EMAIL}
        hasPassword={hasPassword}
        onCreatePassword={createPassword}
        onSignIn={signIn}
      />
    );
  }

  return (
    <AdminDashboard
      adminEmail={ADMIN_EMAIL}
      data={data}
      onDataChange={setData}
      onSignOut={signOut}
    />
  );
}
