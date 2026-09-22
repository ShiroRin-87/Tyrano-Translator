import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json 必须使用 Manifest V3");
}

if (manifest.version !== packageJson.version) {
  throw new Error("manifest.json 与 package.json 版本号必须一致");
}

const mainWorldHook = manifest.content_scripts?.find((entry) => entry.world === "MAIN");
if (!mainWorldHook?.js?.includes("src/page/engine-hook.js")) {
  throw new Error("manifest.json 缺少页面主执行环境的 Tyrano 挂钩");
}

const requiredEntries = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...(manifest.content_scripts?.flatMap((entry) => [...entry.js, ...(entry.css ?? [])]) ?? [])
].filter(Boolean);

await Promise.all(
  requiredEntries.map(async (entry) => {
    await readFile(new URL(`../${entry}`, import.meta.url));
  })
);

console.log(`Extension manifest is valid; checked ${requiredEntries.length} entry files.`);
