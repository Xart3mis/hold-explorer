import type { CommandError } from "../../bindings/CommandError";
import { t } from "../../text/i18n";
import { Button } from "../Button/Button";
import { Notice } from "../Notice/Notice";

export interface ErrorStateProps {
  /** What the failed command returned. Its message says what happened, why, and how to fix it. */
  error: CommandError;
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
                <Button variant="quiet" onPress={onRetry} isPending={isRetrying === true}>
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
