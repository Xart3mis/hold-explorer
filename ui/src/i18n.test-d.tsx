import { useTranslation } from "react-i18next";

// Typecheck only (never run): a key that is not in the catalog must be a type error.
export function CatalogKeys() {
  const { t } = useTranslation();
  const known = t("app.name");
  // @ts-expect-error "app.missing" is not a key of ui/src/locales/en.json
  const unknown = String(t("app.missing"));
  return (
    <p>
      {known}
      {unknown}
    </p>
  );
}
