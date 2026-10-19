import keys from "../../api/file-text-keys.json";
import type { ExportText } from "../../bindings/ExportText";
import { formatList, monthNames } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";

/**
 * The key of the separator a file joins a list with. It is not in the catalog: the interface
 * writes its lists with `formatList` (Intl), and a file writes its lists as the screen does.
 */
const LIST_SEPARATOR = "file.listSeparator";

/** Two stand-ins for list items, which no text of the app holds: what is between them is the separator. */
const FIRST = "";
const SECOND = "";

/** What `formatList` puts between two items: `, `. */
function listSeparator(): string {
  const written = formatList([FIRST, SECOND]);
  return written.slice(written.indexOf(FIRST) + FIRST.length, written.indexOf(SECOND));
}

/**
 * Every label `file-text-keys.json` names, from the catalog, and the month names from Intl. A
 * label that holds a value has its place in single braces (`Holds by {dim}`), which the catalog
 * leaves as they are and Rust fills. A label that says what a text of the screen says is a
 * reference to that text in the catalog (`$t(lines.column.line)`), so the two cannot differ; the
 * catalog resolves it here.
 */
export function exportText(): ExportText {
  const labels: Record<string, string> = {};
  for (const key of keys) {
    // The keys of the fixture are under `file` in the catalog; a test holds the two equal.
    labels[key] = key === LIST_SEPARATOR ? listSeparator() : t(key as MessageKey);
  }
  return { labels, months: monthNames() };
}
