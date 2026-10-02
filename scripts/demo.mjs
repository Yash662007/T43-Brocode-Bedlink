import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverDir = join(root, "server");

console.log("[demo] seeding a fresh demo database...");
const seed = spawnSync("npx", ["tsx", "scripts/seed-demo.ts"], {
  cwd: serverDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (seed.status !== 0) {
  console.error("[demo] seed failed, aborting.");
  process.exit(seed.status ?? 1);
}

function run(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    shell: process.platform === "win32",
    env: process.env,
  });
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  });
  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) console.error(`[${name}] ${line}`);
    }
  });
  return child;
}

console.log("[demo] starting backend (http://localhost:4000) and frontend (http://localhost:8080)...");
const backend = run("server", "npx", ["tsx", "src/index.ts"], serverDir);
const frontend = run("web", "npx", ["vite", "dev"], root);

function shutdown() {
  console.log("\n[demo] shutting down...");
  backend.kill();
  frontend.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
