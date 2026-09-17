import { build, Platform, Arch } from "electron-builder";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url),
  pkg = JSON.parse(await readFile("package.json", "utf8")),
  version = require("electron/package.json").version,
  nativeRoot = dirname(
    require.resolve("better-sqlite3/package.json", {
      paths: [resolve("apps/desktop")],
    }),
  );
if (process.platform !== "win32") {
  const bin = require.resolve("prebuild-install/bin.js", {
    paths: [nativeRoot],
  });
  const r = spawnSync(
    process.execPath,
    [
      bin,
      "--runtime=electron",
      `--target=${version}`,
      "--platform=win32",
      "--arch=x64",
    ],
    { cwd: nativeRoot, stdio: "inherit" },
  );
  if (r.status !== 0)
    throw new Error(
      "Précompilation SQLite Windows indisponible. Compiler sur Windows avec les outils C++.",
    );
  const header = await readFile(
    join(nativeRoot, "build/Release/better_sqlite3.node"),
  );
  if (header[0] !== 0x4d || header[1] !== 0x5a)
    throw new Error(
      "Module SQLite non Windows : création de l’installeur refusée.",
    );
}
const feed = process.env.TASKFLOW_UPDATE_URL;
if (feed) {
  const u = new URL(feed);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error(
      "TASKFLOW_UPDATE_URL doit être une URL HTTPS sans identifiants.",
    );
}
await build({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  publish: "never",
  config: {
    ...pkg.build,
    npmRebuild: process.platform === "win32",
    publish: feed ? [{ provider: "generic", url: feed }] : null,
  },
});
