import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { keys } from "../../api/keys";
import { IMPORT_PATH } from "../../app/destinations";
import type { ImportDraft } from "../../bindings/ImportDraft";
import { clearImport } from "./draft";

/** Whether an address belongs to the import flow. */
function inFlow(pathname: string): boolean {
  return pathname === IMPORT_PATH || pathname.startsWith(`${IMPORT_PATH}/`);
}

/**
 * Whether the app is on a page of the import flow at this moment. The guard below is there for
 * as long as the app is, and keeps it; a cancel that is answered after its page has gone asks it.
 */
let onFlowPage = false;

/** What a cancel is pressed for. */
export interface Leave {
  /** Where the app goes once the import is cancelled. */
  to: string;
  /**
   * The content hash of the file the cancel is for; `null` while that file is still being read
   * and has none yet, which drops whatever file is open.
   */
  file: string | null;
}

/**
 * Cancels the import: the draft of the file is dropped on the Rust side, then forgotten here,
 * and the app goes to the address the mutation is given, which is where the import was started
 * unless the page says otherwise. A cancel that fails changes nothing; its error is the
 * mutation's.
 *
 * The answer may come after the user has left the import by another way. The draft is forgotten
 * all the same, and the user stays where they went: only a page of the flow is left for them.
 * It may also come after another file was opened, or while one is being read. The cancel was not
 * for that file: the Rust side keeps its draft, and the answer is ignored here.
 */
export function useLeaveImport() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (leave: Leave) => {
      await api.importCancel(leave.file);
      return leave;
    },
    onSuccess: ({ to, file }) => {
      if (file !== null) {
        const open = client.getQueryData<ImportDraft>(keys.importDraft);
        if (open !== undefined && open.file.content_hash !== file) return;
        if (client.isFetching({ queryKey: keys.importOpens }) > 0) return;
      }
      clearImport(client);
      if (onFlowPage) void navigate(to);
    },
  });
}

/**
 * Watches the address. When the app leaves the import flow while a file is still open for
 * import, by the sidebar, the workspace switcher, a shortcut, or the history, the file is
 * dropped here and on the Rust side, exactly as Cancel drops it. Moving between the pages of the
 * flow drops nothing. It renders nothing.
 */
export function ImportLeaveGuard() {
  const client = useQueryClient();
  const { pathname } = useLocation();
  const wasInFlow = useRef(false);

  useEffect(() => {
    onFlowPage = inFlow(pathname);
    return () => {
      onFlowPage = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (inFlow(pathname)) {
      wasInFlow.current = true;
      return;
    }
    if (!wasInFlow.current) return;
    wasInFlow.current = false;
    // Cancel and a finished import have already forgotten the file: nothing is left to drop.
    const draft = client.getQueryData<ImportDraft>(keys.importDraft);
    if (draft === undefined) return;
    clearImport(client);
    // The draft on the Rust side is replaced by the next file that is opened, so a cancel that
    // could not be delivered leaves nothing the user has to know about or act on.
    api.importCancel(draft.file.content_hash).catch(() => undefined);
  }, [pathname, client]);

  return null;
}

/**
 * Where a page of the flow leads when it is reached while no file is open, as after a restart of
 * the interface: the import page, which says that the file has to be opened again.
 */
export function ReopenFile({ from }: { from: string }) {
  return <Navigate to={IMPORT_PATH} replace state={{ from, reopen: true }} />;
}
