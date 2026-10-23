/** Keeps a setting for the next start. Storage that refuses is done without. */
export function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The settings file is where the setting is saved; this copy only spares a wrong first frame.
  }
}

/** The setting kept by `remember`, when it is one of `allowed`. */
export function remembered<Value extends string>(
  key: string,
  allowed: readonly Value[],
): Value | null {
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.find((value) => value === stored) ?? null;
  } catch {
    return null;
  }
}
