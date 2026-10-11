import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const message =
  "Call commands through api in ui/src/api/commands.ts, the only module that imports invoke.";

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
    files: ["ui/src/**/*.{ts,tsx}"],
    ignores: ["ui/src/api/commands.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/api",
              message,
            },
          ],
          patterns: [
            {
              group: ["@tauri-apps/api/core", "@tauri-apps/api/core.*", "@tauri-apps/api/core/**"],
              message,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
