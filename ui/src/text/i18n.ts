import i18next, { type ParseKeys } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";

const resources = { en: { translation: en } } as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: (typeof resources)["en"];
  }
}

/**
 * The locale that numbers and dates are written in, here and in the components that format for
 * themselves. English text with the day before the month, as the exports write their dates.
 */
export const locale = "en-GB";

void i18next.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initAsync: false,
});

/** A key of the text catalog, `ui/src/locales/en.json`. A plural key is named without its form. */
export type MessageKey = ParseKeys;

/**
 * The text of a catalog key, with the named values put in. A key with plural forms takes a
 * `count` and i18next chooses the form.
 */
export function t(key: MessageKey, values?: Record<string, string | number>): string {
  return i18next.t(key, values ?? {});
}

export default i18next;
