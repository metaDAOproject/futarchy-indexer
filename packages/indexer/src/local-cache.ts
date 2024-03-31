import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

const CACHE_DIR = path.resolve(__dirname, "cache");
const CACHE_LOCALLY = false; // TODO: turn off when ready to actually start indexing

if (!fs.existsSync(CACHE_DIR)) {
  await fs.promises.mkdir(CACHE_DIR);
}

function getFileAndDirPath(key: string[]): { file: string; dir: string } {
  if (key.length === 0) {
    const error = new Error("Invalid empty key");
    logger.error(error.message);
    throw error;
  }
  const keyCopy = [...key];
  const filename = keyCopy.pop()!;
  const dir = path.resolve(CACHE_DIR, keyCopy.join("/"));
  const file = path.resolve(dir, filename);
  return { file, dir };
}

export async function get(key: string[]): Promise<string[] | undefined> {
  if (!CACHE_LOCALLY) return undefined;
  const { file } = getFileAndDirPath(key);
  if (fs.existsSync(file)) {
    logger.log(`Cache hit on ${key.join("/")}`);
    return (await fs.promises.readFile(file)).toString().split("\n");
  }
  return undefined;
}

export async function set(key: string[], value: string[]): Promise<void> {
  if (!CACHE_LOCALLY) return;
  const { file, dir } = getFileAndDirPath(key);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(file, value.join("\n"));
}
