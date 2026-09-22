import { mkdir, readFile, writeFile } from "node:fs/promises";

const template = await readFile(new URL("../browser/guest-preload.template.cjs", import.meta.url), "utf8");
const engineHook = await readFile(new URL("../src/page/engine-hook.js", import.meta.url), "utf8");
const marker = "__ENGINE_HOOK_SOURCE__";
if (!template.includes(marker)) throw new Error("浏览器预加载模板缺少引擎挂钩占位符");

const outputUrl = new URL("../browser/generated/guest-preload.cjs", import.meta.url);
await mkdir(new URL("../browser/generated/", import.meta.url), { recursive: true });
await writeFile(outputUrl, template.replace(marker, JSON.stringify(engineHook)), "utf8");
console.log(`Generated browser guest preload at ${outputUrl.pathname}`);

