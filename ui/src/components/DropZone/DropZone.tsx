import { useId, type ReactNode } from "react";
import { Button } from "../Button/Button";
import { cx } from "../cx";
import styles from "./DropZone.module.css";

export interface DropZoneProps {
  /** What the zone is for: "Import a holds export". */
  title: string;
  /** One sentence that says how. */
  text: string;
  /** The label of the button that chooses a file, so dropping is never the only way in. */
  chooseLabel: string;
  onChoose: () => void;
  /** The accepted file types, as a caption. */
  fileTypes: string;
  /**
   * Set while a file is dragged over the zone: a title that says what dropping will do, and a
   * sentence that names the file. The button and the file types are hidden meanwhile.
   */
  active?: { title: string; text: string };
  /** Set while an import runs: the progress component, shown in place of the content. */
  progress?: ReactNode;
  /** Set when a file cannot be imported: a danger notice, shown under the zone. */
  error?: ReactNode;
  className?: string | undefined;
}

/**
 * The place a file is dropped on, or chosen from. The window tells it when a file is over it;
 * the zone shows it. Its content at rest keeps its place while it is hidden, so the zone has the
 * same size at rest, with a file over it, and while an import runs.
 */
export function DropZone({
  title,
  text,
  chooseLabel,
  onChoose,
  fileTypes,
  active,
  progress,
  error,
  className,
}: DropZoneProps) {
  const titleId = useId();
  const state = progress !== undefined ? "progress" : active !== undefined ? "active" : "rest";
  return (
    <div className={cx(styles.wrapper, className)}>
      <div
        role="group"
        aria-labelledby={state === "progress" ? undefined : titleId}
        aria-label={state === "progress" ? title : undefined}
        data-active={state === "active" ? "" : undefined}
        data-invalid={error !== undefined && state === "rest" ? "" : undefined}
        className={styles.zone}
      >
        <div
          className={styles.layer}
          data-hidden={state === "rest" ? undefined : ""}
          aria-hidden={state === "rest" ? undefined : "true"}
          inert={state !== "rest"}
        >
          <h2 id={state === "rest" ? titleId : undefined} className={styles.title}>
            {title}
          </h2>
          <p className={styles.text}>{text}</p>
          <Button variant="primary" onPress={onChoose} isDisabled={state !== "rest"}>
            {chooseLabel}
          </Button>
          <p className={styles.types}>{fileTypes}</p>
        </div>
        {state === "active" && active !== undefined ? (
          <div className={styles.layer}>
            <h2 id={titleId} className={styles.title}>
              {active.title}
            </h2>
            <p className={styles.file}>{active.text}</p>
          </div>
        ) : null}
        {state === "progress" ? (
          <div className={cx(styles.layer, styles.progress)}>{progress}</div>
        ) : null}
      </div>
      {error === undefined ? null : <div>{error}</div>}
    </div>
  );
}
