import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
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
  window.location.pathname === "/login/admin";
const learningRole =
  window.location.pathname === "/student" ||
  window.location.pathname.startsWith("/student/") ||
  window.location.pathname === "/login/student"
    ? "student"
    : window.location.pathname === "/instructor" ||
        window.location.pathname.startsWith("/instructor/") ||
        window.location.pathname === "/login/instructor"
      ? "instructor"
      : null;
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
const LearningPortal = React.lazy(() =>
  import("./portal/LearningPortal.jsx").then((module) => ({
    default: module.LearningPortal,
  })),
);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <React.Suspense fallback={null}>
        <AdminPortal />
      </React.Suspense>
    ) : learningRole ? (
      <React.Suspense fallback={null}>
        <LearningPortal role={learningRole} />
      </React.Suspense>
    ) : registrationRole ? (
      <RegistrationPage role={registrationRole} />
    ) : isNewsRoute ? (
      <NewsPage />
    ) : (
      <App />
    )}
     <Analytics />
  </React.StrictMode>,
);
