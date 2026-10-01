import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const localWranglerRoot = join(tmpdir(), "laki-game-wrangler");
const wranglerCli = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");

const child = spawn(
  process.execPath,
  [wranglerCli, ...process.argv.slice(2), "--persist-to", join(localWranglerRoot, "state")],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? join(localWranglerRoot, "config"),
    },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
