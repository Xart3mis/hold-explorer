import { ESLint } from "eslint";
import { join, resolve } from "node:path";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

/**
 * ESLint with the configuration of the repository, eslint.config.js. The rules that need the
 * types of the project are off: the files linted here exist only as text, and the rule the tests
 * are about, which module may import which, reads nothing but the import.
 */
const eslint = new ESLint({ cwd: root, overrideConfig: [tseslint.configs.disableTypeChecked] });

/**
 * What the import rule says about a module at `file` (a path from the repository root) that
 * imports `source`: its messages, none when the import is allowed.
 */
async function refusals(file: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(`import ${JSON.stringify(source)};\n`, {
    filePath: join(root, file),
  });
  if (result === undefined) throw new Error(`ESLint gave no result for ${file}.`);
  const broken = result.messages.find((message) => message.fatal === true);
  if (broken !== undefined) throw new Error(`ESLint could not read ${file}: ${broken.message}`);
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

/** An import that breaks two rules is refused by both, so one of the messages is the one meant. */
async function expectRefused(file: string, source: string, saying: RegExp): Promise<void> {
  const said = await refusals(file, source);
  expect(said, `${file} imports ${source}`).not.toEqual([]);
  expect(said.join("\n"), `${file} imports ${source}`).toMatch(saying);
}

async function expectAllowed(file: string, source: string): Promise<void> {
  expect(await refusals(file, source), `${file} imports ${source}`).toEqual([]);
}

describe("the commands that change the view", () => {
  it("are refused to a feature", async () => {
    await expectRefused(
      "ui/src/features/lines/LinesPage.tsx",
      "../../api/workspace-commands",
      /workspaceAction\(\)/,
    );
    await expectRefused(
      "ui/src/features/lines/sorts.ts",
      "../../api/workspace-commands",
      /workspaceAction\(\)/,
    );
    await expectRefused(
      "ui/src/features/lines/LinesPage.test.tsx",
      "../../api/workspace-commands",
      /workspaceAction\(\)/,
    );
  });

  it("are refused to a component, to the text modules, to the other modules of the api, and to the development page", async () => {
    for (const [file, source] of [
      ["ui/src/components/Tag/Tag.tsx", "../../api/workspace-commands"],
      ["ui/src/text/format.ts", "../api/workspace-commands"],
      ["ui/src/api/window.ts", "./workspace-commands"],
      ["ui/src/dev/commands.ts", "../api/workspace-commands"],
      ["ui/src/main.tsx", "./api/workspace-commands"],
    ] as const) {
      await expectRefused(file, source, /workspaceAction\(\)/);
    }
  });

  it("are open to the modules of ui/src/app/, and to the tests of the api and of the command mock", async () => {
    await expectAllowed("ui/src/app/actions/snapshots.ts", "../../api/workspace-commands");
    await expectAllowed("ui/src/app/query.ts", "../api/workspace-commands");
    await expectAllowed("ui/src/api/command-args.test.ts", "./workspace-commands");
    await expectAllowed("ui/src/test/ipc.test.ts", "../api/workspace-commands");
    await expectRefused("ui/src/test/ipc.ts", "../api/workspace-commands", /workspaceAction\(\)/);
  });

  it("leave the other commands open to a feature", async () => {
    await expectAllowed("ui/src/features/lines/LinesPage.tsx", "../../api/commands");
  });
});

describe("the layers", () => {
  it("refuse a module of the api that imports from the app", async () => {
    await expectRefused("ui/src/api/error.ts", "../app/query", /ui\/src\/api\//);
    await expectRefused("ui/src/api/error.ts", "../app/shell/context", /ui\/src\/api\//);
    await expectRefused("ui/src/api/window.ts", "../features/import/start", /ui\/src\/api\//);
    await expectRefused("ui/src/api/window.ts", "../components", /ui\/src\/api\//);
    await expectRefused("ui/src/api/window.ts", "../design/theme", /ui\/src\/api\//);
  });

  it("let a module of the api import the text modules and the bindings", async () => {
    await expectAllowed("ui/src/api/error.ts", "../text/i18n");
    await expectAllowed("ui/src/api/keys.ts", "../bindings/ViewRef");
    await expectAllowed("ui/src/api/window.ts", "./files");
    await expectAllowed("ui/src/api/commands.test.ts", "../test/ipc");
  });

  it("refuse a text module that imports anything of the app", async () => {
    for (const source of ["../api/error", "../app/query", "../components", "../bindings/Theme"]) {
      await expectRefused("ui/src/text/format.ts", source, /ui\/src\/text\//);
    }
    await expectAllowed("ui/src/text/i18n.ts", "../locales/en.json");
    await expectAllowed("ui/src/text/format.ts", "./i18n");
  });

  it("refuse a component that imports from the api, the app, or a feature", async () => {
    for (const source of ["../../api/keys", "../../app/view", "../../features/shell/AppLayout"]) {
      await expectRefused("ui/src/components/Tag/Tag.tsx", source, /ui\/src\/components\//);
    }
    for (const source of [
      "../../text/i18n",
      "../../design/token-values",
      "../../bindings/CommandError",
      "../Button/Button",
    ]) {
      await expectAllowed("ui/src/components/Tag/Tag.tsx", source);
    }
    await expectAllowed("ui/src/components/Tag/Tag.test.tsx", "../../test/axe");
  });

  it("refuse a module of the app that imports a feature, except the router, which names the pages", async () => {
    await expectRefused("ui/src/app/view.ts", "../features/shell/problem", /ui\/src\/app\//);
    await expectRefused(
      "ui/src/app/shell/Page.tsx",
      "../../features/shell/Shell.module.css",
      /ui\/src\/app\//,
    );
    await expectAllowed("ui/src/app/router.tsx", "../features/overview/OverviewPage");
    for (const source of ["../text/i18n", "../api/keys", "../components", "../design/theme"]) {
      await expectAllowed("ui/src/app/providers.tsx", source);
    }
  });

  it("let a feature import every layer", async () => {
    for (const source of [
      "../../text/format",
      "../../api/commands",
      "../../app/view",
      "../../components",
      "../../design/token-values",
      "../../bindings/LinePage",
      "../filters/FilterBar",
    ]) {
      await expectAllowed("ui/src/features/lines/LinesPage.tsx", source);
    }
  });
});

describe("the modules of Tauri", () => {
  it("are imported by the modules of ui/src/api/ only, and invoke by the two that hold the commands", async () => {
    await expectRefused("ui/src/features/lines/LinesPage.tsx", "@tauri-apps/api/core", /invoke/);
    await expectRefused("ui/src/app/view.ts", "@tauri-apps/plugin-dialog", /ui\/src\/api\//);
    await expectRefused("ui/src/api/window.ts", "@tauri-apps/api/core", /invoke/);
    await expectAllowed("ui/src/api/window.ts", "@tauri-apps/plugin-dialog");
    await expectAllowed("ui/src/api/commands.ts", "@tauri-apps/api/core");
    await expectAllowed("ui/src/api/workspace-commands.ts", "@tauri-apps/api/core");
  });

  it("give their mocks to the tests and to the development page, and nothing else", async () => {
    await expectAllowed("ui/src/test/ipc.ts", "@tauri-apps/api/mocks");
    await expectAllowed("ui/src/dev/commands.ts", "@tauri-apps/api/mocks");
    await expectAllowed("ui/src/app/view.test.tsx", "@tauri-apps/api/mocks");
    await expectRefused("ui/src/app/view.test.tsx", "@tauri-apps/api/core", /invoke/);
    await expectRefused("ui/src/test/window.ts", "@tauri-apps/plugin-dialog", /ui\/src\/api\//);
  });
});
