import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, "dist", "tyrano-translator");
const expectedParent = resolve(projectRoot, "dist");
const sourceManifest = JSON.parse(await readFile(join(projectRoot, "manifest.json"), "utf8"));

if (dirname(outputDirectory) !== expectedParent || outputDirectory !== join(expectedParent, "tyrano-translator")) {
  throw new Error(`拒绝清理非项目输出目录：${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  cp(join(projectRoot, "manifest.json"), join(outputDirectory, "manifest.json")),
  cp(join(projectRoot, "src"), join(outputDirectory, "src"), { recursive: true })
]);

const manifest = JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8"));
if (manifest.version !== sourceManifest.version) throw new Error("构建产物版本不正确");

console.log(`Built Tyrano Translator ${manifest.version} at ${outputDirectory}`);
