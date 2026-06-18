import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { NewsPage } from "./news/NewsPage.jsx";
import { RegistrationPage } from "./registration/RegistrationPage.jsx";
import "./styles.css";

const isNewsRoute =
  window.location.pathname === "/news" ||
  window.location.pathname.startsWith("/news/");
const isAdminRoute =
  window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/") ||
  window.location.pathname === "/login/admin" ||
  window.location.hash.includes("access_token=") ||
  window.location.search.includes("type=invite") ||
  window.location.search.includes("type=recovery");
const registrationRole = window.location.pathname.startsWith(
  "/register/volunteer-instructor",
)
  ? "volunteer-instructor"
  : window.location.pathname.startsWith("/register/student")
    ? "student"
    : null;
const AdminPortal = React.lazy(() =>
  import("./admin/AdminPortal.jsx").then((module) => ({
    default: module.AdminPortal,
  })),
);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <React.Suspense fallback={null}>
        <AdminPortal />
      </React.Suspense>
    ) : registrationRole ? (
      <RegistrationPage role={registrationRole} />
    ) : isNewsRoute ? (
      <NewsPage />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
