import { useCallback, useState } from "react";

const NONE: ReadonlySet<string> = new Set();

/**
 * The rows selected on a screen, by key: held for one result, and cleared as soon as `resultKey`
 * names another (another filter, sort, mode, dimension, or snapshot), when the rows it named are
 * gone. The table hands over the keys in the order of its rows (`onSelectedKeysChange`), and the
 * screen gives them back (`selectedKeys`); the export menu reads them from here.
 */
export function useSelectedRows(resultKey: string): {
  keys: ReadonlySet<string>;
  set: (keys: ReadonlySet<string>) => void;
  clear: () => void;
} {
  const [held, setHeld] = useState<{ resultKey: string; keys: ReadonlySet<string> }>({
    resultKey,
    keys: NONE,
  });
  // Another result drops what was held, in the render that first sees it.
  if (held.resultKey !== resultKey) setHeld({ resultKey, keys: NONE });
  const keys = held.resultKey === resultKey ? held.keys : NONE;
  const set = useCallback(
    (next: ReadonlySet<string>) => {
      setHeld({ resultKey, keys: next.size === 0 ? NONE : next });
    },
    [resultKey],
  );
  const clear = useCallback(() => {
    setHeld({ resultKey, keys: NONE });
  }, [resultKey]);
  return { keys, set, clear };
}
