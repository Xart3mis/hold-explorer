import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { ArgsOf, CommandName, ResultOf } from "../api/commands";
import type { CommandError } from "../bindings/CommandError";

/**
 * An error that carries a command's `kind` as a failed command does. A handler throws it to make
 * the command reject.
 */
export function commandFailure(kind: string, message: string): Error & CommandError {
  return Object.assign(new Error(message), { kind });
}

export type Handlers = Partial<{ [K in CommandName]: (args: ArgsOf<K>) => ResultOf<K> }>;

/**
 * Answers the commands with the given handlers. A command without a handler rejects with a
 * `CommandError` of kind `Internal` that names it, so a forgotten handler shows in the test.
 */
export function mockCommands(handlers: Handlers): void {
  mockWindows("main");
  mockIPC((command, payload) => {
    if (!Object.hasOwn(handlers, command)) {
      throw commandFailure("Internal", `The test has no handler for the command ${command}.`);
    }
    // The handler for `command` takes the arguments of that command; the name is only known at run time.
    const handler = handlers[command as CommandName] as (args: unknown) => unknown;
    return handler(payload ?? {});
  });
}
