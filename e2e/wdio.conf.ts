// The end-to-end tests of the built app (decision 9 of the M1d plan). WebdriverIO drives the
// window through tauri-driver, which starts WebKitWebDriver, which starts the app built with the
// cargo feature `e2e` (`pnpm e2e:build`). e2e/README.md gives the steps.
//
// Each spec file runs in a worker of its own, with a tauri-driver of its own and fresh folders:
// tauri-driver hands its environment to WebKitWebDriver and so to the app, and `tauri:options`
// carries no environment, so the folders are given to tauri-driver as it is started. The spec
// files run one after the other on the one port.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPEN_VAR, SAVE_DIR_VAR } from "./support/run.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The app built with `--features e2e`, and the command line that writes the synthetic workbook. */
const APP = path.join(ROOT, "target", "debug", "hx-desktop");
const CLI = path.join(ROOT, "target", "debug", "hx-cli");
/** The logs of WebdriverIO and of tauri-driver (with the app's own output), kept by CI on a failure. */
const LOGS = path.join(ROOT, "target", "e2e", "logs");
/** tauri-driver from the PATH, or from `TAURI_DRIVER`. */
const DRIVER = process.env.TAURI_DRIVER ?? "tauri-driver";
const HOST = "127.0.0.1";
const PORT = 4444;

/** How long tauri-driver has to listen on its port, and to stop when asked. */
const DRIVER_START_MS = 30_000;
const DRIVER_STOP_MS = 10_000;

/** The tauri-driver of this worker, and the folders of its run. */
let driver: ChildProcess | undefined;
let runDir: string | undefined;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stops tauri-driver at once and removes the folders of the run, when they are still there. */
function stopNow(): void {
  if (driver !== undefined && !exited(driver)) driver.kill("SIGTERM");
  driver = undefined;
  if (runDir !== undefined) rmSync(runDir, { recursive: true, force: true });
  runDir = undefined;
}

/** Whether the child process has ended. */
function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Resolves once something listens on the port of tauri-driver; fails when `driver` has exited. */
async function listening(child: ChildProcess, log: string): Promise<void> {
  const deadline = Date.now() + DRIVER_START_MS;
  while (Date.now() < deadline) {
    if (exited(child)) {
      throw new Error(
        `tauri-driver exited before it listened on port ${String(PORT)}. See ${log}.`,
      );
    }
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: HOST, port: PORT }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => {
        resolve(false);
      });
    });
    if (open) return;
    await pause(200);
  }
  throw new Error(
    `tauri-driver did not listen on port ${String(PORT)} within ${String(DRIVER_START_MS / 1000)} s. See ${log}.`,
  );
}

export const config: WebdriverIO.Config = {
  runner: "local",
  hostname: HOST,
  port: PORT,
  specs: ["./specs/**/*.e2e.ts"],
  // One window at a time: every spec file uses the one port of tauri-driver.
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": { application: APP },
      // WebKitWebDriver speaks WebDriver classic; WebdriverIO would ask for BiDi otherwise.
      "wdio:enforceWebDriverClassic": true,
    },
  ],
  logLevel: "info",
  outputDir: LOGS,
  framework: "mocha",
  reporters: ["spec"],
  // The first start of WebKit, and the demo workspace that is built, take a while on a runner.
  mochaOpts: { ui: "bdd", timeout: 180_000 },
  waitforTimeout: 30_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,

  /**
   * Before any worker: the built app, the command line, and tauri-driver are there, and the logs
   * folder is.
   */
  onPrepare() {
    const missing: string[] = [];
    for (const binary of [APP, CLI]) {
      if (!existsSync(binary)) missing.push(`${binary} is missing. Run pnpm e2e:build first.`);
    }
    const help = spawnSync(DRIVER, ["--help"], { stdio: "ignore" });
    if (help.error !== undefined) {
      missing.push(
        `tauri-driver could not be run (${DRIVER}): ${help.error.message}. Install it as e2e/README.md says, or set TAURI_DRIVER to its path.`,
      );
    }
    if (missing.length > 0) {
      // WebdriverIO logs an error thrown here and runs the specs anyway, each of which would
      // fail on what is missing; the run stops here instead, saying what is missing.
      console.error(missing.join("\n"));
      process.exit(1);
    }
    mkdirSync(LOGS, { recursive: true });
  },

  /**
   * In the worker of a spec file, before its session: fresh home, config, and data folders, the
   * paths the dialogs answer with, and a tauri-driver that hands them to the app.
   */
  async beforeSession(_config, _capabilities, _specs, cid) {
    runDir = mkdtempSync(path.join(tmpdir(), "hx-e2e-"));
    const home = path.join(runDir, "home");
    const saveDir = path.join(runDir, "saved");
    for (const folder of [home, saveDir]) mkdirSync(folder, { recursive: true });
    // The spec reads the same two paths from its own environment.
    process.env[OPEN_VAR] = path.join(runDir, "Holds.xlsx");
    process.env[SAVE_DIR_VAR] = saveDir;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
      // No native message box may wait for a press that never comes.
      HX_NO_NATIVE_DIALOG: "1",
    };
    delete env.HX_SMOKE;

    const log = path.join(LOGS, `tauri-driver-${cid}.log`);
    const out = openSync(log, "a");
    driver = spawn(DRIVER, ["--port", String(PORT)], { env, stdio: ["ignore", out, out] });
    // WebdriverIO calls no afterSession for a session that could not be created: the worker's
    // exit stops tauri-driver then, so that the next spec file finds its port free.
    process.once("exit", stopNow);
    await listening(driver, log);
  },

  /** Before the tests of a spec file: the synthetic workbook the open dialog answers with. */
  before() {
    const workbook = process.env[OPEN_VAR];
    if (workbook === undefined)
      throw new Error(`${OPEN_VAR} is not set: beforeSession did not run.`);
    const written = spawnSync(
      CLI,
      ["synth", "--out", workbook, "--seed", "7", "--lines", "400", "--holds", "1200"],
      { encoding: "utf8" },
    );
    if (written.status !== 0) {
      throw new Error(`hx-cli synth failed (${String(written.status)}): ${written.stderr}`);
    }
  },

  /** After the session of a spec file: tauri-driver stops, with WebKitWebDriver, and the folders go. */
  async afterSession() {
    const child = driver;
    driver = undefined;
    if (child !== undefined && !exited(child)) {
      child.kill("SIGTERM");
      const deadline = Date.now() + DRIVER_STOP_MS;
      while (!exited(child) && Date.now() < deadline) await pause(100);
      if (!exited(child)) child.kill("SIGKILL");
    }
    if (runDir !== undefined) rmSync(runDir, { recursive: true, force: true });
    runDir = undefined;
  },
};
