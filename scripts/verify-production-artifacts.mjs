import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const outputDirectory = resolve(process.cwd(), process.argv[2] ?? "dist");
const files = (directory) => readdirSync(directory).flatMap((entry) => {
  const absolute = join(directory, entry);
  return statSync(absolute).isDirectory() ? files(absolute) : [absolute];
});
const relativeFiles = files(outputDirectory).map((file) => ({
  absolute: file,
  relative: relative(outputDirectory, file).replaceAll("\\", "/"),
}));
const sourceMaps = relativeFiles.filter(({ relative: file }) => file.endsWith(".map"));
if (sourceMaps.length) throw new Error(`Production source maps must not be public: ${sourceMaps.map(({ relative: file }) => file).join(", ")}`);

const worker = readFileSync(join(outputDirectory, "sw.js"), "utf8");
if (worker.includes("__KUMO_PRECACHE_MANIFEST__")) throw new Error("The service worker precache manifest was not injected.");
const precacheCandidates = relativeFiles
  .map(({ relative: file }) => file)
  .filter((file) => !["index.html", "manifest.json", "sw.js"].includes(file));
const missingPrecacheEntries = precacheCandidates.filter((file) => !worker.includes(JSON.stringify(`/${file}`)));
if (missingPrecacheEntries.length) throw new Error(`Service worker precache is incomplete: ${missingPrecacheEntries.join(", ")}`);

const compressedBytes = (extension) => relativeFiles
  .filter(({ relative: file }) => file.endsWith(extension))
  .map(({ absolute, relative: file }) => ({ file, bytes: gzipSync(readFileSync(absolute)).byteLength }));
const javascript = compressedBytes(".js").filter(({ file }) => file !== "sw.js");
const styles = compressedBytes(".css");
const total = (entries) => entries.reduce((sum, entry) => sum + entry.bytes, 0);
const largestJavaScript = Math.max(0, ...javascript.map(({ bytes }) => bytes));
const budgets = {
  totalJavaScriptGzip: 550_000,
  largestJavaScriptGzip: 90_000,
  totalCssGzip: 35_000,
};
const actual = {
  totalJavaScriptGzip: total(javascript),
  largestJavaScriptGzip: largestJavaScript,
  totalCssGzip: total(styles),
};
for (const [metric, limit] of Object.entries(budgets)) {
  if (actual[metric] > limit) throw new Error(`${metric} exceeded its ${limit}-byte gzip budget (${actual[metric]} bytes).`);
}

console.log(`Production artifacts verified: ${precacheCandidates.length} offline assets, no public source maps, ${actual.totalJavaScriptGzip}B JS gzip, ${actual.totalCssGzip}B CSS gzip.`);
