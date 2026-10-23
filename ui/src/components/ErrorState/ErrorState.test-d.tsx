import { ErrorState } from "./ErrorState";

// Typecheck only (never run): the error is one the interface holds, so its kind is one of the
// kinds a command answers with or one of the interface's own, and a misspelt kind is refused.
export const states = [
  <ErrorState key="command" error={{ kind: "ViewChanged", message: "The view changed." }} />,
  <ErrorState key="interface" error={{ kind: "ViewUnsettled", message: "Still refused." }} />,
  // @ts-expect-error a kind that no command answers with and the interface does not make
  <ErrorState key="misspelt" error={{ kind: "ViewChange", message: "The view changed." }} />,
];
