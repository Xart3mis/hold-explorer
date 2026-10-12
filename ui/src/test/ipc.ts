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

/** A handler answers at once, or with a promise when the test decides the moment of the answer. */
export type Handlers = Partial<{
  [K in CommandName]: (args: ArgsOf<K>) => ResultOf<K> | Promise<ResultOf<K>>;
}>;

/** The commands that arrived in this test without a handler, in the order they arrived. */
const unhandled: string[] = [];
/** The commands this test said it expects to arrive without a handler. */
const expected = new Set<string>();

/**
 * Says that this test expects these commands to arrive without a handler: it is about what the
 * app does then. Without it, a command that has no handler fails the test it arrived in. It holds
 * for the test that calls it, and for no other.
 */
export function expectUnhandled(...commands: CommandName[]): void {
  for (const command of commands) expected.add(command);
}

/**
 * Fails when a command arrived without a handler that the test did not say it expects. The setup
 * file calls it after every test, and what was recorded and declared is forgotten either way.
 *
 * A command without a handler is rejected like any failed command, and a page shows a failed
 * command as an error it is built to show. So a test that forgot a handler would pass while it
 * looked at an error page, and this is what tells the two apart.
 */
export function checkUnhandledCommands(): void {
  const missed = [...new Set(unhandled.filter((command) => !expected.has(command)))];
  unhandled.length = 0;
  expected.clear();
  if (missed.length === 0) return;
  throw new Error(
    `The test sent ${missed.length === 1 ? "a command" : "commands"} it has no handler for: ` +
      `${missed.join(", ")}. Give mockCommands (or renderApp) a handler for each, with the ` +
      "answer the test expects. If the test is about a command without a handler, declare it " +
      "with expectUnhandled() from ui/src/test/ipc.ts.",
  );
}

/**
 * Answers the commands with the given handlers. A command without a handler rejects with a
 * `CommandError` of kind `Internal` that names it, and is recorded: the test it arrived in fails
 * after it has run, unless it declared the command with `expectUnhandled`.
 */
export function mockCommands(handlers: Handlers): void {
  mockWindows("main");
  mockIPC((command, payload) => {
    if (!Object.hasOwn(handlers, command)) {
      unhandled.push(command);
      throw commandFailure("Internal", `The test has no handler for the command ${command}.`);
    }
    // The handler for `command` takes the arguments of that command; the name is only known at run time.
    const handler = handlers[command as CommandName] as (args: unknown) => unknown;
    return handler(payload ?? {});
  });
}
