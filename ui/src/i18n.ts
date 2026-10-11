import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

const resources = { en: { translation: en } } as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: (typeof resources)["en"];
  }
}

void i18next.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initAsync: false,
});

export default i18next;
