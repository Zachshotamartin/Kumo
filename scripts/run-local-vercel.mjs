import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const parseEnv = (source) => Object.fromEntries(
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();
      const quoted = (rawValue.startsWith('"') && rawValue.endsWith('"'))
        || (rawValue.startsWith("'") && rawValue.endsWith("'"));
      return [key, quoted ? rawValue.slice(1, -1).replace(/\\n/g, "\n") : rawValue];
    })
);

const localEnvUrl = new URL("../.env.local", import.meta.url);
const localEnv = parseEnv(await readFile(localEnvUrl, "utf8"));
const validation = spawnSync(process.execPath, [
  fileURLToPath(new URL("./validate-vercel-runtime-env.mjs", import.meta.url)),
  fileURLToPath(localEnvUrl),
  "--require-concrete",
  "--local-runtime",
], { stdio: "inherit" });
if (validation.status !== 0) process.exit(validation.status ?? 1);
const forwardedArgs = process.argv.slice(2);
const hasListenArgument = forwardedArgs.includes("--listen") || forwardedArgs.includes("-l");
const args = [
  "node_modules/vercel/dist/index.js",
  "dev",
  "--local-config",
  "vercel.dev.json",
  ...(hasListenArgument ? [] : ["--listen", "5175"]),
  ...forwardedArgs,
];

const child = spawn(process.execPath, args, {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, ...localEnv },
  stdio: "inherit",
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
