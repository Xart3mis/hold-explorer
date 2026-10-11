import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLayoutEffect, type ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { api } from "../api/commands";
import { keys } from "../api/keys";
import { ToastRegion } from "../components/ToastRegion/ToastRegion";
import { applyTheme } from "../design/theme";
import { locale } from "./i18n";
import { queryClient } from "./query";

/**
 * Applies the saved theme as soon as the application start is known, and again whenever the
 * cached settings change. It renders nothing and holds nothing back.
 */
function SavedTheme() {
  const { data } = useQuery({ queryKey: keys.start, queryFn: () => api.appStart() });
  const theme = data?.settings.theme;
  // A layout effect, so the theme is on the root element before the frame that knows it is painted.
  useLayoutEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
  return null;
}

/** Everything a screen relies on: the query client, the locale of the components, and toasts. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={locale}>
        <SavedTheme />
        <ToastRegion>{children}</ToastRegion>
      </I18nProvider>
    </QueryClientProvider>
  );
}
