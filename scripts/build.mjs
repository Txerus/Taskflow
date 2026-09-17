import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("apps/desktop/dist", { recursive: true });
await build({
  entryPoints: ["apps/desktop/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "apps/desktop/dist/main.cjs",
  external: ["electron", "better-sqlite3", "electron-updater"],
});
await build({
  entryPoints: ["apps/desktop/src/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "apps/desktop/dist/preload.cjs",
  external: ["electron"],
});
await copyFile("apps/desktop/assets/tray.png", "apps/desktop/dist/tray.png");
await viteBuild({ configFile: "apps/desktop/vite.config.ts" });
