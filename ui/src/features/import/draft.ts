// What the pages of the import flow share: the file that is open, what its review found, and what
// the user has chosen so far. All three are kept in the query cache, beside the draft the import
// page puts there, so they outlive the page that made them and go together.
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation } from "react-router";
import { keys } from "../../api/keys";
import { OVERVIEW_PATH, WELCOME_PATH } from "../../app/destinations";
import { useCached } from "../../app/query";
import { useShell } from "../../app/shell/context";
import type { ImportDraft } from "../../bindings/ImportDraft";
import type { ImportReview } from "../../bindings/ImportReview";
import type { Fields } from "./fields";
import { readImportLocation } from "./start";

/** The target that stands for a workspace the import creates. No workspace has this id. */
export const NEW_WORKSPACE = "+new";

/** What the user has chosen in the flow. Every choice starts as "what the app proposes". */
export interface ImportChoices {
  /** The mapping as the mapping page left it; `null` for the mapping the app proposes. */
  fields: Fields | null;
  /** The date field as it was left, when the date or the time differs from the detected one. */
  date: string | null;
  /** The time field as it was left, under the same condition. */
  time: string | null;
  /** The user confirmed a date that is only the file's modified time. */
  confirmed: boolean;
  /** The id of the workspace to import into, or `NEW_WORKSPACE`; `null` for the suggestion. */
  target: string | null;
  /** The name of the new workspace; `null` for the name the app proposes. */
  newName: string | null;
  /** The snapshot of the same day to replace; `null` to keep them all. */
  replace: number | null;
}

const PROPOSED: ImportChoices = {
  fields: null,
  date: null,
  time: null,
  confirmed: false,
  target: null,
  newName: null,
  replace: null,
};

/** Forgets the file that is open for import, with its review, its checks, and the choices. */
export function clearImport(client: QueryClient): void {
  client.removeQueries({ queryKey: keys.importDraft });
  client.removeQueries({ queryKey: keys.importReview });
  client.removeQueries({ queryKey: keys.importChoices });
  client.removeQueries({ queryKey: keys.importChecks });
}

/**
 * Makes a file the one that is open for import. What was reviewed and chosen belonged to the
 * file, or the sheet, that was open before, and goes.
 */
export function openDraft(client: QueryClient, draft: ImportDraft): void {
  clearImport(client);
  client.setQueryData(keys.importDraft, draft);
}

/**
 * The state of the import flow, for its pages: the draft, the review once one was made, the
 * choices, and where the import was started.
 */
export function useImportDraft() {
  const client = useQueryClient();
  const { start } = useShell();
  const location = useLocation();
  const draft = useCached((cache) => cache.getQueryData<ImportDraft>(keys.importDraft));
  const review = useCached((cache) => cache.getQueryData<ImportReview>(keys.importReview));
  const choices =
    useCached((cache) => cache.getQueryData<ImportChoices>(keys.importChoices)) ?? PROPOSED;

  const choose = useCallback(
    (chosen: Partial<ImportChoices>) => {
      client.setQueryData<ImportChoices>(keys.importChoices, (held) => ({
        ...(held ?? PROPOSED),
        ...chosen,
      }));
    },
    [client],
  );

  const home = start.open === null ? WELCOME_PATH : OVERVIEW_PATH;
  const { from, others, error } = readImportLocation(location.state, home);
  return {
    /** The file that is open for import; absent when none is. */
    draft,
    /** What the last review of that file found; absent until one was made. */
    review,
    choices,
    /** Keeps choices, beside the ones made before. */
    choose,
    /** The address the import was started from, to return to when it is cancelled. */
    from,
    /** How many more files were dropped with this one; the page the file opens on says so. */
    others,
    /** The error another page of the flow sent the user here with, when one did. */
    sentWith: error ?? null,
  };
}
