import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const message =
  "Call commands through api in ui/src/api/commands.ts, the only module that imports invoke.";

const invokeModules = ["@tauri-apps/api/core", "@tauri-apps/api/core.*", "@tauri-apps/api/core/**"];

// The file dialog, the file manager, and the window's own events are reached through one module.
const tauriMessage =
  "Reach Tauri through the modules of ui/src/api/: commands.ts for commands, window.ts for the file dialog, the file manager, and files dragged over the window.";

// Numbers and dates are formatted in one module, so every screen writes them the same way.
const formatMessage =
  "Format numbers and dates with the helpers in ui/src/app/format.ts, the only module that calls Intl.";
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
  "Take user-facing text from the catalog, ui/src/locales/en.json, with t() from ui/src/app/i18n.ts.";
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
  {
    // Commands: `invoke` is imported by one module.
    files: ["ui/src/api/**/*.{ts,tsx}"],
    ignores: ["ui/src/api/commands.ts", "ui/src/api/**/*.test.ts", "ui/src/api/**/*.test-d.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@tauri-apps/api", message }],
          patterns: [{ group: invokeModules, message }],
        },
      ],
    },
  },
  {
    // Everything else of Tauri (the file dialog, the file manager, the window's events) is
    // imported by the modules of ui/src/api/ only. A screen imports from there.
    files: ["ui/src/**/*.{ts,tsx}"],
    ignores: ["ui/src/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@tauri-apps/api", message }],
          patterns: [
            { group: invokeModules, message },
            {
              group: ["@tauri-apps/*", "@tauri-apps/*/**"],
              message: tauriMessage,
            },
          ],
        },
      ],
    },
  },
  {
    // Tests and the development page answer the commands themselves, with the mocks Tauri ships.
    // Nothing else of Tauri is open to them.
    files: ["ui/src/test/**/*.{ts,tsx}", "ui/src/dev/**/*.{ts,tsx}", "ui/src/**/*.test.{ts,tsx}"],
    ignores: ["ui/src/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@tauri-apps/api", message }],
          patterns: [
            { group: invokeModules, message },
            {
              regex: "^@tauri-apps/(?!api/mocks$)",
              message: tauriMessage,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["ui/src/**/*.{ts,tsx}"],
    ignores: ["ui/src/app/format.ts"],
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
