/**
 * Something an action of the top bar could not do, or that a page reported with `report` of the
 * shell, for the shell to show as a danger notice under the top bar: what failed, and the reason
 * with its fix. `rename` is a failed rename of the workspace, which the name field refers to as
 * the description of its error.
 */
export interface ShellProblem {
  kind: "rename" | "action";
  /** What failed. */
  title: string;
  /** Why, and what to do: the text of the command's error. */
  message: string;
}
