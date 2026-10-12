// The app's own pages in a plain browser, for looking at them while `pnpm dev` runs:
//
//   http://localhost:1420/dev.html?state=first-run#/welcome
//
// The commands are answered from fixtures (ui/src/dev/commands.ts), in the state the address
// names. `theme=light` starts in the light theme. This page is for development only: the build
// has one entry, index.html, and `pnpm check:dist` fails on this page or on its marker.
import { DEV_STATES, installDevCommands, isDevState } from "./commands";

const params = new URLSearchParams(window.location.search);
const asked = params.get("state") ?? "";
const state = isDevState(asked) ? asked : DEV_STATES[0];
const theme = params.get("theme") === "light" ? "Light" : "Dark";

document.documentElement.dataset.page = installDevCommands(state, theme);
// The stored theme belongs to another run of this page; the address decides here.
window.localStorage.removeItem("hold-explorer.theme");
// The app starts once the commands can answer.
await import("../main");
