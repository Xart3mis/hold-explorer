import type { ErrorKind } from "../../bindings/ErrorKind";
import { t } from "../../text/i18n";
import { Button } from "../Button/Button";
import { Notice } from "../Notice/Notice";

/**
 * The kinds of the errors a screen shows: those a command answers with, and the interface's own
 * (`InterfaceKind` of ui/src/api/error.ts, which a component may not import; the type test of
 * this component checks that the two lists are the same).
 */
export type ShownErrorKind = ErrorKind | "Dialog" | "ViewUnsettled" | "WorkspaceChanged";

export interface ErrorStateProps {
  /**
   * What the failed command returned, or a failure the interface made in its shape. Its message
   * says what happened, why, and how to fix it.
   */
  error: { kind: ShownErrorKind; message: string };
  /** What failed, in the words of the screen. A general heading is used otherwise. */
  title?: string;
  /** Shows a retry button that calls this. */
  onRetry?: () => void;
  /** The retry is running: the button is busy and ignores presses. */
  isRetrying?: boolean;
  className?: string | undefined;
}

/**
 * What a screen shows in place of content that failed to load: an inline danger notice with the
 * command's own message, unchanged, and a retry action when the screen can offer one.
 */
export function ErrorState({ error, title, onRetry, isRetrying, className }: ErrorStateProps) {
  return (
    <div data-kind={error.kind} className={className}>
      <Notice
        tone="danger"
        title={title ?? t("errorState.title")}
        {...(onRetry === undefined
          ? {}
          : {
              actions: (
                <Button
                  variant="quiet"
                  onPress={onRetry}
                  reservesPendingSpace
                  isPending={isRetrying === true}
                >
                  {t("common.retry")}
                </Button>
              ),
            })}
      >
        {error.message}
      </Notice>
    </div>
  );
}
