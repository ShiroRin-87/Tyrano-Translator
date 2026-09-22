import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json 必须使用 Manifest V3");
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

