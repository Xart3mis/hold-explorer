import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const message =
  "Call commands through the modules of ui/src/api/ that hold them, commands.ts and workspace-commands.ts, the only modules that import invoke.";

const invokeModules = ["@tauri-apps/api/core", "@tauri-apps/api/core.*", "@tauri-apps/api/core/**"];

// The file dialog, the file manager, and the window's own events are reached through one module.
const tauriMessage =
  "Reach Tauri through the modules of ui/src/api/: commands.ts and workspace-commands.ts for commands, window.ts for the file dialog, the file manager, and files dragged over the window.";

// How much of Tauri a set of files may import. `invoke` is imported by the two modules that hold
// the commands. Everything else of Tauri (the file dialog, the file manager, the window's events)
// is imported by the modules of ui/src/api/ only; a screen imports from there. Tests and the
// development page answer the commands themselves, with the mocks Tauri ships, and nothing else
// of Tauri is open to them.
const invoke = {
  paths: [{ name: "@tauri-apps/api", message }],
  group: { group: invokeModules, message },
};
const tauri = {
  all: { paths: [], patterns: [] },
  noInvoke: { paths: invoke.paths, patterns: [invoke.group] },
  none: {
    paths: invoke.paths,
    patterns: [
      invoke.group,
      { group: ["@tauri-apps/*", "@tauri-apps/*/**"], message: tauriMessage },
    ],
  },
  mocks: {
    paths: invoke.paths,
    patterns: [invoke.group, { regex: "^@tauri-apps/(?!api/mocks$)", message: tauriMessage }],
  },
};

// A command that changes the open workspace or the selected snapshot is sent as an action made
// with workspaceAction(). A feature that sent one by itself would run outside the order of the
// actions, and while it ran a page could read one snapshot's data for another. So those commands
// are in a module of their own, and only the modules of ui/src/app/ import it.
const workspaceCommands = {
  regex: "(^|/)workspace-commands(\\.ts)?$",
  message:
    "Send a command that changes the open workspace or the selected snapshot as an action made with workspaceAction() of ui/src/app/view.ts; the actions that exist are in ui/src/app/actions/. Only the modules of ui/src/app/ import ui/src/api/workspace-commands.ts.",
};

// The layers of ui/src/, lowest first: text, api, components, app, features. A module imports
// from its own layer and from the ones named for it here, never from one above. A test of a layer
// also imports the helpers of ui/src/test/ and the catalog it compares texts with.
const folders = [
  "api",
  "app",
  "bindings",
  "components",
  "design",
  "dev",
  "features",
  "locales",
  "test",
  "text",
];
const layers = {
  text: {
    imports: ["locales"],
    message:
      "A module of ui/src/text/ imports nothing else of the app: every layer imports the text modules, so they import none of them.",
  },
  api: {
    imports: ["text", "bindings"],
    message:
      "A module of ui/src/api/ imports the text modules (ui/src/text/) and the bindings only. What needs the app, a component, or a feature belongs in ui/src/app/ or in the feature.",
  },
  components: {
    imports: ["text", "design", "bindings"],
    message:
      "A module of ui/src/components/ imports the text modules (ui/src/text/), the design modules, and the bindings only. A component takes what it shows as props: it sends no command and knows no screen.",
  },
  app: {
    imports: ["text", "api", "bindings", "components", "design"],
    message:
      "A module of ui/src/app/ imports no feature; only the router (ui/src/app/router.tsx) names the pages. What two features share belongs in ui/src/app/.",
  },
};

/** The imports a module of a layer may not make: every folder of ui/src/ it is not given. */
function above(name, { isTest = false } = {}) {
  const { imports, message } = layers[name];
  const open = [name, ...imports, ...(isTest ? ["test", "locales"] : [])];
  const closed = folders.filter((folder) => !open.includes(folder));
  return { regex: `^(\\.\\./)+(${closed.join("|")})(/|$)`, message };
}

/** The setting of no-restricted-imports for one set of files. */
function restricted(access, ...patterns) {
  return ["error", { paths: access.paths, patterns: [...access.patterns, ...patterns] }];
}

/** The test files of one folder of ui/src/ ("api/"), or of all of it. */
function tests(folder = "") {
  return [`ui/src/${folder}**/*.test.{ts,tsx}`, `ui/src/${folder}**/*.test-d.{ts,tsx}`];
}

// Numbers and dates are formatted in one module, so every screen writes them the same way.
const formatMessage =
  "Format numbers and dates with the helpers in ui/src/text/format.ts, the only module that calls Intl.";
const formatSyntax = [
  { selector: "MemberExpression[object.name='Intl']", message: formatMessage },
  { selector: "NewExpression[callee.object.name='Intl']", message: formatMessage },
  {
    selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
    message: formatMessage,
  },
];

// Every user-facing string is in the text catalog. A component takes its visible text as props
// from the screen that uses it, or from the catalog with t().
const catalogMessage =
  "Take user-facing text from the catalog, ui/src/locales/en.json, with t() from ui/src/text/i18n.ts.";
const textAttributes =
  "/^(aria-label|aria-description|aria-roledescription|aria-valuetext|alt|title|placeholder|label)$/";
const catalogSyntax = [
  { selector: "JSXText[value=/[A-Za-z]/]", message: catalogMessage },
  {
    selector: `JSXAttribute[name.name=${textAttributes}] > Literal[value=/[A-Za-z]/]`,
    message: catalogMessage,
  },
  {
    selector: `JSXAttribute[name.name=${textAttributes}] > JSXExpressionContainer > :matches(Literal[value=/[A-Za-z]/], TemplateLiteral)`,
    message: catalogMessage,
  },
  {
    selector:
      ":matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(Literal[value=/[A-Za-z]/], TemplateLiteral)",
    message: catalogMessage,
  },
];

export default tseslint.config(
  {
    ignores: [
      ".claude/",
      ".superpowers/",
      ".omc/",
      ".serena/",
      ".tokensave/",
      "docs/",
      "tools/parity/",
      "tools/design/",
      "dist/",
      "node_modules/",
      "target/",
      "src-tauri/",
      "ui/src/bindings/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // Which module may import which. A later block replaces an earlier one for the files it names,
  // so each block holds everything that binds its files.
  {
    files: ["ui/src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restricted(tauri.none, workspaceCommands) },
  },
  {
    files: ["ui/src/test/**/*.{ts,tsx}", "ui/src/dev/**/*.{ts,tsx}", ...tests()],
    rules: { "no-restricted-imports": restricted(tauri.mocks, workspaceCommands) },
  },
  {
    // The tests of the command mock send every kind of command through it.
    files: tests("test/"),
    rules: { "no-restricted-imports": restricted(tauri.mocks) },
  },
  ...["text", "components"].flatMap((name) => [
    {
      files: [`ui/src/${name}/**/*.{ts,tsx}`],
      rules: { "no-restricted-imports": restricted(tauri.none, workspaceCommands, above(name)) },
    },
    {
      files: tests(`${name}/`),
      rules: {
        "no-restricted-imports": restricted(
          tauri.mocks,
          workspaceCommands,
          above(name, { isTest: true }),
        ),
      },
    },
  ]),
  {
    files: ["ui/src/app/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restricted(tauri.none, above("app")) },
  },
  {
    files: tests("app/"),
    rules: { "no-restricted-imports": restricted(tauri.mocks, above("app", { isTest: true })) },
  },
  {
    // The router is where the pages of the features are given their addresses.
    files: ["ui/src/app/router.tsx"],
    rules: { "no-restricted-imports": restricted(tauri.none) },
  },
  {
    files: ["ui/src/api/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restricted(tauri.noInvoke, workspaceCommands, above("api")) },
  },
  {
    files: ["ui/src/api/commands.ts", "ui/src/api/workspace-commands.ts"],
    rules: { "no-restricted-imports": restricted(tauri.all, workspaceCommands, above("api")) },
  },
  {
    files: tests("api/"),
    rules: { "no-restricted-imports": restricted(tauri.all, above("api", { isTest: true })) },
  },
  {
    files: ["ui/src/**/*.{ts,tsx}"],
    ignores: ["ui/src/text/format.ts"],
    rules: { "no-restricted-syntax": ["error", ...formatSyntax] },
  },
  {
    // The gallery is a development page with labels of its own, and tests pass sample text to
    // the components they render. Everything else takes its text from the catalog.
    files: ["ui/src/**/*.tsx"],
    ignores: ["ui/src/dev/**", "ui/src/**/*.test.tsx", "ui/src/**/*.test-d.tsx"],
    rules: { "no-restricted-syntax": ["error", ...formatSyntax, ...catalogSyntax] },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
