import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const vite = "node_modules/vite/bin/vite.js";
const build = spawnSync(process.execPath, [vite, "build"], { stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const preview = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", "4178", "--strictPort"],
  { stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => preview.kill(signal));
}

preview.once("error", (error) => {
  throw error;
});
preview.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
