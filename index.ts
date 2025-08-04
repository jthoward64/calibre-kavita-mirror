import { watch } from "node:fs";
import { main } from "./lib.ts";
import { inDir } from "./env.ts";

console.log("Running initial sync...");

await main();

console.log("Initial sync completed.");

const watcher = watch(
  inDir,
  { recursive: true },
  async (eventType, filename) => {
    if (eventType === "change" || eventType === "rename") {
      console.log(`File changed: ${filename}`);
      await main();
    }
  }
);

process.on("SIGINT", () => {
  console.log("Stopping file watcher...");
  watcher.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("Stopping file watcher...");
  watcher.close();
  process.exit(0);
});

console.log("File watcher started. Monitoring changes in:", inDir);
