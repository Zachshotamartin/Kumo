import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const vite = "node_modules/vite/bin/vite.js";

// The browser suite drives a self-contained preview with no backend, but the Firebase client still
// has to construct for the app shell to mount, and `getAuth` rejects an empty key. Supplying a
// placeholder keeps the suite runnable from a bare checkout; a real key in the environment wins.
const buildEnvironment = {
  ...process.env,
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || "test-firebase-browser-key",
};

const build = spawnSync(process.execPath, [vite, "build"], { stdio: "inherit", env: buildEnvironment });
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
