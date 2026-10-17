// The app's own pages in a plain browser, for looking at them while `pnpm dev` runs:
//
//   http://localhost:1420/dev.html?state=first-run#/welcome
//
// The commands are answered from fixtures (ui/src/dev/commands.ts), in the state the address
// names. `theme=light` starts in the light theme, and `density=compact` in the compact density,
// which the app has no setting for yet. A state of the import flow starts with a file
// open, so its pages can be opened by their address:
//
//   http://localhost:1420/dev.html?state=import-findings#/import/review
//
// A state of the filter bar starts with filters set, on the Overview:
//
//   http://localhost:1420/dev.html?state=filters#/overview
//
// This page is for development only: the build has one entry, index.html, and `pnpm check:dist`
// fails on this page or on its marker.
import { keys } from "../api/keys";
import { queryClient } from "../app/query";
import { DEV_STATES, devDraft, devFilters, installDevCommands, isDevState } from "./commands";

const params = new URLSearchParams(window.location.search);
const asked = params.get("state") ?? "";
const state = isDevState(asked) ? asked : DEV_STATES[0];
const theme = params.get("theme") === "light" ? "Light" : "Dark";

document.documentElement.dataset.page = installDevCommands(state, theme);
// The stored theme belongs to another run of this page; the address decides here.
window.localStorage.removeItem("hold-explorer.theme");
if (params.get("density") === "compact") document.documentElement.dataset.density = "compact";
// A state of the import flow has its file open, as the import page leaves it.
const draft = devDraft(state);
if (draft !== null) queryClient.setQueryData(keys.importDraft, draft);
// A state of the filter bar starts with filters set, as the user of this session left them.
const set = devFilters(state);
if (set !== null) queryClient.setQueryData(keys.workspaceFilters(set.workspaceId), set.filters);
// The app starts once the commands can answer.
await import("../main");
