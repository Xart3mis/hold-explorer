import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProviders } from "./app/providers";
import "./app/i18n";
import "./design/fonts.css";
import "./design/tokens.css";
import "./app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("The page has no element with the id root, so the interface cannot start.");
}
createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
