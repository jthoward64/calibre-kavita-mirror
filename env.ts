import { stat } from "node:fs/promises";

const inDirRaw = process.env.SOURCE_DIR;
const outDirRaw = process.env.TARGET_DIR;

if (!inDirRaw || !outDirRaw) {
  console.error("SOURCE_DIR and TARGET_DIR environment variables must be set.");
  process.exit(1);
}

const inDirStat = await stat(inDirRaw).catch(() => null);
if (!inDirStat || !inDirStat.isDirectory()) {
  console.error(
    `SOURCE_DIR "${inDirRaw}" is not a directory or does not exist.`
  );
  process.exit(1);
}
const outDirStat = await stat(outDirRaw).catch(() => null);
if (!outDirStat || !outDirStat.isDirectory()) {
  console.error(
    `TARGET_DIR "${outDirRaw}" is not a directory or does not exist.`
  );
  process.exit(1);
}

export const inDir = inDirRaw;
export const outDir = outDirRaw;
