import { AppProviders } from "./app/providers";
import { AppRouter } from "./app/router";

/** The whole interface: the providers every screen relies on, and the pages on their router. */
export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
