import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./design/tokens.css";
import "./app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("The page has no element with the id root, so the interface cannot start.");
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
