import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { bootI18n } from "./i18n";
import "./index.css";

async function start() {
  // Load the active locale before first paint so Chinese users never see a
  // flash of untranslated UI.
  await bootI18n();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );

  // The inline boot screen in index.html makes first paint instant; hand off to
  // React as soon as the first frame is committed.
  requestAnimationFrame(() => document.getElementById("boot")?.remove());
}

void start();
