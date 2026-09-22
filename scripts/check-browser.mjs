import { readFile } from "node:fs/promises";

const requiredFiles = [
  "../browser/main.mjs",
  "../browser/preload.cjs",
  "../browser/url-policy.mjs",
  "../browser/ui/index.html",
  "../browser/ui/shell.css",
  "../browser/ui/shell.js"
];

await Promise.all(requiredFiles.map((path) => readFile(new URL(path, import.meta.url))));

const mainSource = await readFile(new URL("../browser/main.mjs", import.meta.url), "utf8");
for (const requiredSetting of ["contextIsolation: true", "nodeIntegration: false", "sandbox: true", "webSecurity: true"]) {
  if (!mainSource.includes(requiredSetting)) throw new Error(`浏览器缺少安全设置：${requiredSetting}`);
}
if (!mainSource.includes("WebContentsView")) throw new Error("浏览器必须使用 WebContentsView 隔离远程页面");

console.log(`Standalone browser shell is valid; checked ${requiredFiles.length} files.`);

