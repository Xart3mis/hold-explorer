import { useTranslation } from "react-i18next";
import { t } from "./i18n";

// Typecheck only (never run): a key that is not in the catalog must be a type error.
export function CatalogKeys() {
  const { t: translate } = useTranslation();
  const known = translate("app.name");
  // @ts-expect-error "app.missing" is not a key of ui/src/locales/en.json
  const unknown = String(translate("app.missing"));
  return (
    <p>
      {known}
      {unknown}
    </p>
  );
}

// The same holds for the plain function. A plural key is named without its form.
export const direct = [
  t("app.name"),
  t("table.rowCount", { count: 2 }),
  // @ts-expect-error "app.missing" is not a key of ui/src/locales/en.json
  t("app.missing"),
];
