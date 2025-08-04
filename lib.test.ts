import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  calculateTargetPath,
  getFilesInTargetDir,
  linkFile,
  parseOpf,
  readSourceFiles,
  safeUnlink,
  syncFiles,
} from "./lib";
import { mkdir, readdir, rm } from "node:fs/promises";
import { outDir } from "./env";
import { de } from "zod/locales";

if (process.env.NODE_ENV !== "test") {
  throw new Error("This file should only be run in test mode.");
}

beforeAll(async () => {
  // Clear the target directory before starting tests
  for (const file of await readdir(outDir)) {
    if (file === ".gitkeep") continue; // Skip .gitkeep file
    await rm(`${outDir}/${file}`, { recursive: true, force: true });
  }
});

afterEach(async () => {
  // Clear the target directory after each test
  for (const file of await readdir(outDir)) {
    if (file === ".gitkeep") continue; // Skip .gitkeep file
    await rm(`${outDir}/${file}`, { recursive: true, force: true });
  }
});

describe("parseOpf", async () => {
  const aBookOpf = await Bun.file(
    "./test/source/Jane Doe/A Book/metadata.opf"
  ).text();
  const firstBookOpf = await Bun.file(
    "./test/source/John Smith/First Book/metadata.opf"
  ).text();

  test("should parse a metadata file without series and series index", () => {
    const metadata = parseOpf(aBookOpf);
    expect(metadata.title).toBe("A Book");
    expect(metadata.creator).toBe("Jane Doe");
    expect(metadata.id).toBe("00000000-0000-0000-0001");
    expect(metadata.series).toBeUndefined();
    expect(metadata.seriesIndex).toBeUndefined();
  });

  test("should parse a metadata file with series and series index", () => {
    const metadata = parseOpf(firstBookOpf);
    expect(metadata.title).toBe("First Book");
    expect(metadata.creator).toBe("John Smith");
    expect(metadata.id).toBe("00000000-0000-0000-0003");
    expect(metadata.series).toBe("Books");
    expect(metadata.seriesIndex).toBe(1);
  });

  test("should throw an error for invalid OPF format", () => {
    const opfContent = `<invalid>content</invalid>`;
    expect(() => parseOpf(opfContent)).toThrow("Invalid OPF format");
  });
});

describe("calculateTargetPath", () => {
  test("should calculate target path for a book without series", () => {
    const metadata = {
      title: "A Book",
      creator: "Jane Doe",
    };
    const [directory, file] = calculateTargetPath(metadata);
    expect(directory).toBe(`A Book - Jane Doe`);
    expect(file).toBe("A Book - Jane Doe.epub");
  });

  test("should calculate target path for a book with series", () => {
    const metadata = {
      series: "Books",
      seriesIndex: 1,
    };
    const [directory, file] = calculateTargetPath(metadata);
    expect(directory).toBe("Books");
    expect(file).toBe("Books - 01.epub");
  });
});

describe("getFilesInTargetDir", () => {
  test("should return an empty array if the target directory is empty", async () => {
    const files = await getFilesInTargetDir();
    expect(files.size).toBe(0);
  });

  test("should not return files at the top level of the target directory", async () => {
    // Create a dummy file in the target directory
    const dummyFilePath = `${outDir}/dummy.epub`;
    await Bun.write(dummyFilePath, "Dummy content");

    const files = await getFilesInTargetDir();
    expect(files.size).toBe(0);
  });

  test("should return files in subdirectories of the target directory", async () => {
    // Create a dummy subdirectory with a file
    const subDir = `${outDir}/subdir`;
    await mkdir(subDir, { recursive: true });
    const dummyFilePath = `${subDir}/dummy.epub`;
    await Bun.write(dummyFilePath, "Dummy content");

    const files = await getFilesInTargetDir();
    expect(files.size).toBe(1);
    expect(files.has("subdir/dummy.epub")).toBe(true);
  });

  test("should only return files with .epub extension", async () => {
    // Create a dummy subdirectory with a file and a non-epub file
    const subDir = `${outDir}/subdir`;
    await mkdir(subDir, { recursive: true });
    const epubFilePath = `${subDir}/dummy.epub`;
    const txtFilePath = `${subDir}/dummy.txt`;
    await Bun.write(epubFilePath, "Dummy content");
    await Bun.write(txtFilePath, "Dummy content");

    const files = await getFilesInTargetDir();
    expect(files.size).toBe(1);
    expect(files.has("subdir/dummy.epub")).toBe(true);
    expect(files.has("subdir/dummy.txt")).toBe(false);
  });
});

describe("linkFile", () => {
  test("should create a link for a file with valid metadata", async () => {
    const sourceMeta = "./test/source/John Smith/First Book/metadata.opf";
    const sourceFile = "./test/source/John Smith/First Book/First Book.epub";
    const metadata = parseOpf(await Bun.file(sourceMeta).text());
    const result = await linkFile(sourceFile, metadata);
    expect(result).toBe("Books/Books - 01.epub");
    const targetFile = Bun.file(`${outDir}/Books/Books - 01.epub`);
    expect(await targetFile.exists()).toBe(true);
    const stat = await targetFile.stat();
    expect(stat.size).toBeGreaterThan(0);

    const sourceStat = await Bun.file(sourceFile).stat();
    expect(stat.ino).toBe(sourceStat.ino);
  });

  test("should return null if metadata does not have enough information", async () => {
    const result = await linkFile(
      "./test/source/Jane Doe/A Book/A Book.epub",
      {}
    );
    expect(result).toBeNull();
  });
});

describe("readSourceFiles", () => {
  test("should read all source files in the directory", async () => {
    const files = await readSourceFiles();
    expect(files.length).toBe(5);
    expect(files).toContainEqual([
      "./test/source/John Smith/First Book/First Book.epub",
      {
        creator: "John Smith",
        id: "00000000-0000-0000-0003",
        series: "Books",
        seriesIndex: 1,
        title: "First Book",
      },
    ]);
    expect(files).toContainEqual([
      "./test/source/John Smith/Third Book/Third Book.epub",
      {
        creator: "John Smith",
        id: "00000000-0000-0000-0004",
        series: "Books",
        seriesIndex: 3,
        title: "Third Book",
      },
    ]);
    expect(files).toContainEqual([
      "./test/source/John Smith/Just a Book/Just a Book.epub",
      {
        creator: "John Smith",
        id: "00000000-0000-0000-0005",
        series: undefined,
        seriesIndex: undefined,
        title: "Just a Book",
      },
    ]);
    expect(files).toContainEqual([
      "./test/source/Jane Doe/A Book/A Book.epub",
      {
        creator: "Jane Doe",
        id: "00000000-0000-0000-0001",
        series: undefined,
        seriesIndex: undefined,
        title: "A Book",
      },
    ]);
    expect(files).toContainEqual([
      "./test/source/Jane Doe/Another  Book/Another_Book.epub",
      {
        creator: "Jane Doe",
        id: "00000000-0000-0000-0002",
        series: undefined,
        seriesIndex: undefined,
        title: "Another Book",
      },
    ]);
  });
});

describe("safeUnlink", () => {
  test("should remove a file if it exists", async () => {
    const filePath = `${outDir}/test-file-to-remove.epub`;
    await Bun.write(filePath, "Test content");
    const result = await safeUnlink(filePath);
    expect(result).toBe(true);
    expect(await Bun.file(filePath).exists()).toBe(false);
  });

  test("should fail if we try to remove a potentially unsafe file", async () => {
    const filePath = `/root-file`;
    expect(await safeUnlink(filePath)).toBe(false);
  });
});

describe("syncFiles", () => {
  test("should link files from source to target directory", async () => {
    await syncFiles();
    const targetFiles = await getFilesInTargetDir();
    expect(targetFiles.size).toBeGreaterThan(0);
    expect(targetFiles.has("Books/Books - 01.epub")).toBe(true);
    expect(targetFiles.has("Books/Books - 03.epub")).toBe(true);
    expect(
      targetFiles.has("Just a Book - John Smith/Just a Book - John Smith.epub")
    ).toBe(true);
    expect(targetFiles.has("A Book - Jane Doe/A Book - Jane Doe.epub")).toBe(
      true
    );
    expect(
      targetFiles.has("Another Book - Jane Doe/Another Book - Jane Doe.epub")
    ).toBe(true);
  });

  test("should remove unused files from the target directory", async () => {
    // Create an unused file in the target directory
    const unusedFilePath = `${outDir}/unused-file.epub`;
    await Bun.write(unusedFilePath, "Unused content");

    await syncFiles();
    const targetFiles = await getFilesInTargetDir();
    expect(targetFiles.has("unused-file.epub")).toBe(false);
  });
});
