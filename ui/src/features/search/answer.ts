/**
 * The answer of the search command for what is typed, as the search field of the top bar and the
 * command palette both read it: sent once typing has stopped for a moment, from two characters,
 * for the snapshot in view. One hook, so the two cannot drift apart in how they ask or in which
 * answer they show.
 */
import { useEffect, useState } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useSnapshotQuery } from "../../app/view";
import type { SearchResults } from "../../bindings/SearchResults";

/** How long typing must have stopped before what is typed is sent. */
export const SEND_AFTER_MS = 150;

/** The fewest characters, white space at the ends left out, that can find anything. */
export const MIN_QUERY_LENGTH = 2;

/** Whether a text is long enough to find anything. */
export function isSearchable(text: string): boolean {
  return text.trim().length >= MIN_QUERY_LENGTH;
}

/**
 * The answer for `text`, and how to show it. An answer is matched to the text it was asked for
 * by the query it returns, so the answer for an older text is never taken for the answer of the
 * new one (`fresh`); the one shown before stands in for it, dimmed, until the new one is there
 * (`shown`, with `isStale`). Once the text is too short to find anything, nothing stands in, and
 * the next answer starts afresh. With `enabled` false nothing is asked for.
 */
export function useSearchAnswer(text: string, { enabled = true }: { enabled?: boolean } = {}) {
  const [asked, setAsked] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAsked(text);
    }, SEND_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  const query = useSnapshotQuery({
    name: "search",
    params: [asked],
    read: (view, typed) => api.search(view, typed),
    enabled: enabled && isSearchable(asked),
  });
  const answer: SearchResults | undefined = query.data;
  const fresh =
    answer !== undefined && !query.isPlaceholderData && answer.query === text ? answer : null;
  const [kept, setKept] = useState<SearchResults | null>(null);
  if (fresh !== null && kept !== fresh) setKept(fresh);
  if (!isSearchable(text) && kept !== null) setKept(null);
  const shown = fresh ?? kept;
  const searchable = enabled && isSearchable(text);
  const failed = searchable && query.isError && fresh === null && asked === text;
  /** No answer for what is typed yet: the list is busy. */
  const isWaiting = searchable && !failed && fresh === null;
  return {
    /** The answer for what is typed; `null` until it is there. */
    fresh,
    /** What the list shows: the fresh answer, or the one of before standing in for it. */
    shown,
    isWaiting,
    /** What is shown is the answer for an earlier text. */
    isStale: isWaiting && shown !== null,
    /** Why the search for what is typed failed; `null` when it did not. */
    error: failed ? asCommandError(query.error).message : null,
    /** Asks again for what is typed. */
    retry: () => query.refetch(),
    /** Forgets what was asked, at once: for a field that was cleared. */
    forget: () => {
      setAsked("");
    },
  };
}
