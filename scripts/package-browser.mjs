import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const target = process.argv[2];
if (!new Set(["dir", "nsis"]).has(target)) {
  throw new Error("Usage: node scripts/package-browser.mjs <dir|nsis>");
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const builderCli = path.join(projectRoot, "node_modules", "electron-builder", "cli.js");
const cacheDirectory = path.join(projectRoot, ".electron-builder-cache");

const child = spawn(process.execPath, [builderCli, "--win", target], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_BUILDER_CACHE: cacheDirectory
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`electron-builder stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
