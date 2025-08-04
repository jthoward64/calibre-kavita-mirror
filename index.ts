import { readdir, mkdir, link, unlink, stat, readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { watch } from "node:fs";

const inDir = process.env.SOURCE_DIR!;
const outDir = process.env.TARGET_DIR!;

if (!inDir || !outDir) {
  console.error("SOURCE_DIR and TARGET_DIR environment variables must be set.");
  process.exit(1);
}

const inDirStat = await stat(inDir).catch(() => null);
if (!inDirStat || !inDirStat.isDirectory()) {
  console.error(`SOURCE_DIR "${inDir}" is not a directory or does not exist.`);
  process.exit(1);
}
const outDirStat = await stat(outDir).catch(() => null);
if (!outDirStat || !outDirStat.isDirectory()) {
  console.error(`TARGET_DIR "${outDir}" is not a directory or does not exist.`);
  process.exit(1);
}

const opfSchema = z.object({
  package: z.object({
    metadata: z.object({
      "dc:identifier": z.array(
        z.object({
          "#text": z.union([z.string(), z.number()]),
          "opf:scheme": z.string().optional(),
        })
      ),
      "dc:title": z.string().optional(),
      "dc:creator": z.string().optional(),
      meta: z.array(
        z.object({
          name: z.string(),
          content: z.string(),
        })
      ),
    }),
  }),
});

const xmlParser = new XMLParser({
  // Add support for metadata attributes
  attributeNamePrefix: "",
  ignoreAttributes: (name: string) =>
    name !== "name" && name !== "content" && name !== "opf:scheme",
  allowBooleanAttributes: true,
});

interface OpfMetadata {
  id?: string | number;
  title?: string;
  creator?: string;
  series?: string;
  seriesIndex?: number;
}

async function parseOpf(opfContent: string): Promise<OpfMetadata> {
  const parsed = xmlParser.parse(opfContent);
  const validation = opfSchema.safeParse(parsed);
  if (!validation.success) {
    console.error("Validation failed:", validation.error);
    throw new Error("Invalid OPF format");
  }
  const metadata = validation.data.package.metadata;
  const identifiers = metadata["dc:identifier"].find(
    (id) => id["opf:scheme"] === "uuid" || id["opf:scheme"] === "calibre"
  );

  const series = metadata.meta.find((m) => m.name === "calibre:series");
  const seriesIndex = metadata.meta.find(
    (m) => m.name === "calibre:series_index"
  );
  const seriesIndexValue = seriesIndex
    ? parseFloat(seriesIndex.content)
    : undefined;

  return {
    id: identifiers ? identifiers["#text"] : undefined,
    title: metadata["dc:title"],
    creator: metadata["dc:creator"],
    series: series ? series.content : undefined,
    seriesIndex: seriesIndexValue,
  };
}

function calculateTargetPath(
  metadata: OpfMetadata
): [directory: string, file: string] {
  if (
    metadata.series == null ||
    metadata.series === "" ||
    metadata.seriesIndex == null
  ) {
    const effectiveTitle =
      metadata.title?.replace(/\s+/g, " ").replace(/[^a-zA-Z0-9 ]/g, "") ||
      "Unknown Title";
    const effectiveCreator =
      metadata.creator?.replace(/\s+/g, " ").replace(/[^a-zA-Z0-9 ]/g, "") ||
      "Unknown Creator";
    const fileName = `${effectiveTitle} - ${effectiveCreator}`;
    return [fileName, `${fileName}.epub`];
  } else {
    const seriesName = metadata.series
      .replace(/\s+/g, " ")
      .replace(/[^a-zA-Z0-9 ]/g, "");
    const seriesIndex = metadata.seriesIndex.toString().padStart(2, "0");

    const fileName = `${seriesName} - ${seriesIndex}`;

    return [seriesName, `${fileName}.epub`];
  }
}

async function linkFile(
  source: string,
  metadata: OpfMetadata
): Promise<string | null> {
  if (!metadata.title) {
    console.warn("No ID found in metadata, skipping link creation.");
    return null;
  }
  const [directory, fileName] = calculateTargetPath(metadata);
  const target = `${outDir}/${directory}/${fileName}`;
  try {
    await mkdir(`${outDir}/${directory}`, { recursive: true });
    const targetStat = await stat(target).catch(() => null);
    // If the target file exists and has only one link, remove it
    // This prevents issues with dangling links if the file is moved or deleted
    if (targetStat?.nlink && targetStat.nlink < 2) {
      await safeUnlink(target);
    } else if (targetStat) {
      console.log(`Target file already exists: ${target}`);
      return `${directory}/${fileName}`;
    }
    await link(source, target);
    console.log(`Linked ${source} to ${target}`);
    return `${directory}/${fileName}`;
  } catch (error) {
    console.error(`Failed to link ${source} to ${target}:`, error);
    return null;
  }
}

async function readSourceFiles(): Promise<
  [path: string, metadata: OpfMetadata][]
> {
  const files: [path: string, metadata: OpfMetadata][] = [];

  const authorFolders = await readdir(inDir, { withFileTypes: true });
  for (const authorFolder of authorFolders) {
    if (!authorFolder.isDirectory()) continue;
    const authorPath = `${inDir}/${authorFolder.name}`;
    const bookFolders = await readdir(authorPath, { withFileTypes: true });
    for (const bookFolder of bookFolders) {
      if (!bookFolder.isDirectory()) continue;
      const bookPath = `${authorPath}/${bookFolder.name}`;
      const bookFiles = await readdir(bookPath, { withFileTypes: true });
      const epubFile = bookFiles.find(
        (file) => file.isFile() && file.name.endsWith(".epub")
      );
      const opfFile = bookFiles.find(
        (file) => file.isFile() && file.name === "metadata.opf"
      );
      if (!epubFile || !opfFile) continue;

      const metadata = await readFile(`${bookPath}/${opfFile.name}`, "utf-8")
        .then(parseOpf)
        .catch((error) => {
          console.error(`Failed to parse OPF file ${opfFile.name}:`, error);
          return null;
        });
      if (!metadata) continue;

      const sourcePath = `${bookPath}/${epubFile.name}`;
      files.push([sourcePath, metadata]);
    }
  }

  return files;
}

async function getFilesInTargetDir(): Promise<Set<string>> {
  const epubs = new Set<string>();
  const seriesDirs = await readdir(outDir, { withFileTypes: true });
  for (const dir of seriesDirs) {
    if (!dir.isDirectory()) continue;
    const seriesPath = `${outDir}/${dir.name}`;
    const bookFiles = await readdir(seriesPath, { withFileTypes: true });
    for (const file of bookFiles) {
      if (file.isFile() && file.name.endsWith(".epub")) {
        epubs.add(`${dir.name}/${file.name}`);
      }
    }
  }
  return epubs;
}

async function safeUnlink(filePath: string): Promise<void> {
  if (
    [...filePath].filter((c) => c === "/").length < 2 ||
    filePath.startsWith("//")
  ) {
    console.warn(
      `Skipping possibly unsafe unlink for root-level file: ${filePath}`
    );
    return;
  }
  try {
    await unlink(filePath);
    console.log(`Removed file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to remove file ${filePath}:`, error);
  }
}

async function syncFiles() {
  const sourceFiles = await readSourceFiles();
  const targetFiles = await getFilesInTargetDir();

  for (const [sourcePath, metadata] of sourceFiles) {
    const targetPath = await linkFile(sourcePath, metadata);
    if (targetPath && targetFiles.has(targetPath)) {
      targetFiles.delete(targetPath);
    }
  }

  for (const unusedFile of targetFiles) {
    const [seriesName, fileName] = unusedFile.split("/");
    const filePath = `${outDir}/${seriesName}/${fileName}`;
    try {
      await safeUnlink(filePath);
      console.log(`Removed unused file: ${filePath}`);
    } catch (error) {
      console.error(`Failed to remove unused file ${filePath}:`, error);
    }
  }
}

async function main() {
  try {
    await syncFiles();
    console.log("Sync completed successfully.");
  } catch (error) {
    console.error("An error occurred during sync:", error);
  }
}

watch(inDir, { recursive: true }, async (eventType, filename) => {
  if (eventType === "change" || eventType === "rename") {
    console.log(`File changed: ${filename}`);
    await main();
  }
});

// Initial sync on startup
await main();
