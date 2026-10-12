import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { keys } from "../../api/keys";
import { IMPORT_PATH } from "../../app/destinations";
import { clearImport } from "./draft";

/** Whether an address belongs to the import flow. */
function inFlow(pathname: string): boolean {
  return pathname === IMPORT_PATH || pathname.startsWith(`${IMPORT_PATH}/`);
}

/**
 * Cancels the import: the draft is dropped on the Rust side, then forgotten here, and the app
 * goes to the address the mutation is given, which is where the import was started unless the
 * page says otherwise. A cancel that fails changes nothing; its error is the mutation's.
 */
export function useLeaveImport() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (to: string) => {
      await api.importCancel();
      return to;
    },
    onSuccess: (to) => {
      clearImport(client);
      void navigate(to);
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
    if (inFlow(pathname)) {
      wasInFlow.current = true;
      return;
    }
    if (!wasInFlow.current) return;
    wasInFlow.current = false;
    // Cancel and a finished import have already forgotten the file: nothing is left to drop.
    if (client.getQueryData(keys.importDraft) === undefined) return;
    clearImport(client);
    // The draft on the Rust side is replaced by the next file that is opened, so a cancel that
    // could not be delivered leaves nothing the user has to know about or act on.
    api.importCancel().catch(() => undefined);
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
