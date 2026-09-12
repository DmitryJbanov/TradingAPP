import { BacklogPage } from "../src/components/backlog-page";
import React from "react";
import { createRoot } from "react-dom/client";
import Terminal from "../src/components/terminal";
import "../app/globals.css";
const match = location.pathname.match(/^\/pair\/([^/]+)\/?$/);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname.replace(/\/$/, "") === "/backlog" ? (
      <BacklogPage />
    ) : (
      <Terminal symbol={match ? decodeURIComponent(match[1]) : undefined} />
    )}
  </React.StrictMode>,
);
