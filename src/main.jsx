import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { AdminPortal } from "./admin/AdminPortal.jsx";
import "./styles.css";

const isAdminRoute =
  window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/") ||
  window.location.pathname === "/login/admin";
const RootApp = isAdminRoute ? AdminPortal : App;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
