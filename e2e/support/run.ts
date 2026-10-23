// The paths of a spec's run. The config (e2e/wdio.conf.ts) makes fresh folders for each spec file
// and puts these in the environment of the worker and of the app; a spec reads them here.
import { env } from "node:process";

/** The variable of the file the open dialog answers with (src-tauri/src/e2e.rs). */
export const OPEN_VAR = "HX_E2E_OPEN";

/** The variable of the folder the save dialog saves in (src-tauri/src/e2e.rs). */
export const SAVE_DIR_VAR = "HX_E2E_SAVE_DIR";

function required(name: string): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. Run the specs with pnpm e2e, whose config sets it.`);
  }
  return value;
}

/** The synthetic workbook of this run, which the open dialog answers with. */
export function workbookPath(): string {
  return required(OPEN_VAR);
}

/** The folder of this run where the save dialog saves. */
export function saveDir(): string {
  return required(SAVE_DIR_VAR);
}
