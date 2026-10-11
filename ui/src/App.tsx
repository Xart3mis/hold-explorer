import { useTranslation } from "react-i18next";
import "./i18n";

export function App() {
  const { t } = useTranslation();
  return (
    <main className="app">
      <h1>{t("app.name")}</h1>
    </main>
  );
}
