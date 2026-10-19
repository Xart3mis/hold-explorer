// Regenerates ui/src/bindings: removes every generated .ts file, then lets ts-rs rewrite them,
// so a type that was removed from Rust leaves no stale file behind.
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "ui", "src", "bindings");
for (const name of readdirSync(dir)) {
  if (name.endsWith(".ts")) rmSync(join(dir, name));
}

const result = spawnSync(
  "cargo",
  [
    "test",
    "-p",
    "hx-core",
    "-p",
    "hx-store",
    "-p",
    "hx-export",
    "-p",
    "hx-desktop",
    "--features",
    "hx-store/ts,hx-export/ts",
    "--locked",
  ],
  { stdio: "inherit", cwd: join(import.meta.dirname, "..") },
);
process.exit(result.status ?? 1);
