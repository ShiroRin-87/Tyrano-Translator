import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class BrowserStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = structuredClone(defaults);
    this.data = structuredClone(defaults);
    this.queue = Promise.resolve();
  }

  async initialize() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.data = { ...structuredClone(this.defaults), ...parsed };
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      await this.persist();
    }
    return this.read();
  }

  read() {
    return structuredClone(this.data);
  }

  update(mutator) {
    this.queue = this.queue.then(async () => {
      const draft = structuredClone(this.data);
      const next = await mutator(draft);
      this.data = next ?? draft;
      await this.persist();
      return this.read();
    });
    return this.queue;
  }

  async persist() {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

