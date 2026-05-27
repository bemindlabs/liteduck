import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Global error handlers — catch unhandled errors that escape React
window.addEventListener("unhandledrejection", (event) => {
  console.error("[global] Unhandled promise rejection:", event.reason);
});

window.addEventListener("error", (event) => {
  console.error("[global] Uncaught error:", event.error ?? event.message);
});

// Apply dark class by default (app starts in dark mode)
document.documentElement.classList.add("dark");

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in document.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
