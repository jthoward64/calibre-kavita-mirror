import { link, stat, unlink } from "node:fs/promises";

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

// Make a test link across the directories to ensure they are valid
const testFile = `${inDirRaw}/test-link`;
const targetFile = `${outDirRaw}/test-link`;
try {
  await Bun.write(testFile, "test");
  await link(testFile, targetFile);
  await unlink(testFile);
  await unlink(targetFile);
} catch (error) {
  console.error(
    `Failed to create a test link between SOURCE_DIR and TARGET_DIR. Ensure that you mounted a single docker volume and that both SOURCE_DIR and TARGET_DIR are subdirectories of that volume. Error: ${String(
      error
    )}`
  );
  try {
    await unlink(testFile);
  } catch {
    // Ignore if the test link was not created
  }
  try {
    await unlink(targetFile);
  } catch {
    // Ignore if the test link was not created
  }
  process.exit(1);
}

export const inDir = inDirRaw;
export const outDir = outDirRaw;
