import { spawn } from "node:child_process";
import { createServer } from "vite";
import "./build.mjs";
import electron from "electron";
const server = await createServer({
  configFile: "apps/desktop/vite.config.ts",
});
await server.listen();
const child = spawn(electron, ["apps/desktop"], {
  stdio: "inherit",
  env: { ...process.env, TASKFLOW_DEV_URL: "http://localhost:5173" },
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
