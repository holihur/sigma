import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);

// The inline boot screen in index.html makes first paint instant; hand off to
// React as soon as the first frame is committed.
requestAnimationFrame(() => document.getElementById("boot")?.remove());
