import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  Notification,
  globalShortcut,
  dialog,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  mkdirSync,
  copyFileSync,
  unlinkSync,
  statSync,
  existsSync,
  constants,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { autoUpdater } from "electron-updater";
import { SqliteDataStore } from "../../../packages/data/src/sqlite";
import { preferencesSchema } from "@taskflow/core";
import { channels as c } from "./channels";
import { MailOAuth } from "./mail/oauth";
import { MailService } from "./mail/service";
let win: BrowserWindow,
  tray: Tray,
  store: SqliteDataStore,
  mailOAuth: MailOAuth,
  mailService: MailService,
  quitting = false,
  timer: ReturnType<typeof setInterval>;
app.setName("TaskFlow");
app.setPath("userData", join(app.getPath("appData"), "TaskFlow"));
const testing = process.env.TASKFLOW_E2E === "1";
if (testing && process.env.TASKFLOW_USER_DATA)
  app.setPath("userData", process.env.TASKFLOW_USER_DATA);
app.setAppUserModelId("fr.taskflow.desktop");
const renderer = pathToFileURL(join(__dirname, "renderer/index.html")).href;
const devUrl =
  !app.isPackaged && process.env.TASKFLOW_DEV_URL === "http://localhost:5173"
    ? "http://localhost:5173/"
    : null;
function authorized(e: IpcMainInvokeEvent) {
  return (
    e.sender === win.webContents &&
    e.senderFrame === win.webContents.mainFrame &&
    e.senderFrame?.url.split("#")[0] === (devUrl ?? renderer)
  );
}
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!authorized(e)) throw new Error("Appel interdit");
    try {
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      console.error(channel, error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Opération impossible. Réessayez.",
      };
    }
  });
}
const show = () => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  },
  capture = () => {
    show();
    win.webContents.send(c.capture);
  };
function registerIpc() {
  handle(c.mailAuthStatus, () => mailOAuth.status());
  handle(c.connectMail, (provider) => mailOAuth.connect(provider));
  handle(c.disconnectMail, (accountId) => mailOAuth.disconnect(accountId));
  handle(c.syncMail, (accountId) => mailService.sync(accountId));
  handle(c.replyMail, (messageId, body) => mailService.reply(messageId, body));
  handle(c.mailSnapshot, () => store.mailSnapshot());
  handle(c.mailAttachments, (id) => store.mailAttachments(id));
  handle(c.setMailRead, (id, read) => store.setMailRead(id, read));
  handle(c.linkMailTask, (messageId, taskId) =>
    store.linkMailTask(messageId, taskId),
  );
  handle(c.createTaskFromMail, (messageId, input) =>
    store.createTaskFromMail(messageId, input),
  );
  handle(c.waitForMailReply, (input) => store.waitForMailReply(input));
  handle(c.resolveMailWaiting, (id) => store.resolveMailWaiting(id));

  handle(c.notesSnapshot, () => store.notesSnapshot());
  handle(c.saveNotebook, (i) => store.saveNotebook(i));
  handle(c.saveSection, (i) => store.saveSection(i));
  handle(c.savePage, (i) => store.savePage(i));
  handle(c.deleteNote, (kind, id, r) => store.deleteNote(kind, id, r));
  handle(c.restoreNote, (token) => store.restoreNote(token));
  handle(c.linkChecklist, (id, r, item, task) => store.linkChecklist(id, r, item, task));
  handle(c.searchAll, (q) => store.searchAll(q));

  handle(c.snapshot, () => store.snapshot());
  handle(c.createTask, (i) => store.createTask(i));
  handle(c.updateTask, (id, r, i) => store.updateTask(id, r, i));
  handle(c.completeTask, (id, r) => store.completeTask(id, r));
  handle(c.deleteTask, (id) => store.deleteTask(id));
  handle(c.restoreDeletion, (t) => store.restoreDeletion(t));
  handle(c.saveProject, (i) => store.saveProject(i));
  handle(c.saveTag, (i) => store.saveTag(i));
  handle(c.comments, (id) => store.comments(id));
  handle(c.addComment, (id, b) => store.addComment(id, b));
  handle(c.attachments, (id) => store.attachments(id));
  handle(c.setPreferences, async (raw) => {
    const input = preferencesSchema.parse(raw);
    if (process.platform === "win32" && !testing)
      app.setLoginItemSettings({ openAtLogin: input.launchAtLogin });
    return store.setPreferences(input);
  });
  handle(c.windowAction, (action) => {
    if (action === "minimize") win.minimize();
    else if (action === "maximize")
      win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "close") win.close();
    else throw new Error("Commande inconnue");
  });
  const allowed = new Set([
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".txt",
      ".csv",
      ".docx",
      ".xlsx",
      ".pptx",
    ]),
    directory = join(app.getPath("userData"), "attachments");
  mkdirSync(directory, { recursive: true });
  handle(c.captureAttachment, async (taskId) => {
    await store.attachments(taskId);
    const result = await dialog.showOpenDialog(win, {
      title: "Joindre un document (25 Mo maximum)",
      properties: ["openFile"],
      filters: [
        { name: "Documents", extensions: [...allowed].map((x) => x.slice(1)) },
      ],
    });
    if (result.canceled) return null;
    const source = result.filePaths[0];
    if (!source) return null;
    const extension = extname(source).toLowerCase();
    if (!allowed.has(extension)) throw new Error("Format non autorisé.");
    const size = statSync(source).size;
    if (size > 25 * 1024 * 1024) throw new Error("Le document dépasse 25 Mo.");
    const id = randomUUID(),
      dest = join(directory, id + extension);
    copyFileSync(source, dest, constants.COPYFILE_EXCL);
    try {
      return store.addAttachment(taskId, id, basename(source), size);
    } catch (e) {
      unlinkSync(dest);
      throw e;
    }
  });
  handle(c.openAttachment, async (id) => {
    const a = store.attachment(id),
      ext = extname(a.name).toLowerCase();
    if (!allowed.has(ext)) throw new Error("Format non autorisé.");
    const result = await dialog.showMessageBox(win, {
      type: "question",
      message: `Ouvrir « ${a.name} » avec votre application par défaut ?`,
      buttons: ["Annuler", "Ouvrir"],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) {
      const error = await shell.openPath(join(directory, a.id + ext));
      if (error) throw new Error(error);
    }
  });
  handle(c.checkUpdates, async () => {
    if (
      !app.isPackaged ||
      !existsSync(join(process.resourcesPath, "app-update.yml"))
    )
      return "Aucun serveur de mise à jour configuré pour cette version.";
    const result = await autoUpdater.checkForUpdates();
    return result?.updateInfo.version === app.getVersion()
      ? "Vous utilisez la dernière version."
      : "Recherche terminée. Toute mise à jour sera proposée avant installation.";
  });
}
const pendingNotices = new Set<string>();
function checkReminders() {
  if (!Notification.isSupported()) return;
  for (const t of store.dueReminders()) {
    if (pendingNotices.has(t.id)) continue;
    pendingNotices.add(t.id);
    const n = new Notification({ title: "TaskFlow · rappel", body: t.title });
    n.on("click", show);
    n.on("show", () => {
      store.markReminderSent(t.id);
      pendingNotices.delete(t.id);
    });
    n.on("failed", (_, error) => {
      pendingNotices.delete(t.id);
      console.error("Notification", error);
    });
    n.show();
  }
}
if (!testing && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) show();
  });
  app
    .whenReady()
    .then(async () => {
      mkdirSync(app.getPath("userData"), { recursive: true });
      store = new SqliteDataStore(join(app.getPath("userData"), "taskflow.db"));
      mailOAuth = new MailOAuth(store, app.getPath("userData"));
      mailService = new MailService(store, mailOAuth);
      win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1040,
        minHeight: 680,
        title: "TaskFlow",
        show: false,
        titleBarStyle: "hidden",
        backgroundColor: "#f7f8fa",
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e, url) => {
        if (url.split("#")[0] !== (devUrl ?? renderer)) e.preventDefault();
      });
      win.webContents.session.setPermissionRequestHandler((_w, _p, cb) =>
        cb(false),
      );
      win.webContents.session.setPermissionCheckHandler(() => false);
      registerIpc();
      win.on("close", (e) => {
        if (!quitting && !testing) {
          e.preventDefault();
          win.hide();
        }
      });
      tray = new Tray(nativeImage.createFromPath(join(__dirname, "tray.png")));
      tray.setToolTip("TaskFlow");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Ouvrir TaskFlow", click: show },
          { label: "Nouvelle tâche · Ctrl+Maj+Espace", click: capture },
          { type: "separator" },
          {
            label: "Quitter",
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on("double-click", show);
      await win.loadURL(devUrl ?? renderer);
      win.show();
      if (!globalShortcut.register("CommandOrControl+Shift+Space", capture))
        console.warn("Raccourci déjà utilisé par une autre application.");
      timer = setInterval(checkReminders, 15000);
      if (!testing) checkReminders();
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.on("error", (e) => console.error("Mise à jour", e.message));
      autoUpdater.on("update-available", async (info) => {
        const r = await dialog.showMessageBox(win, {
          message: `TaskFlow ${info.version} est disponible.`,
          buttons: ["Plus tard", "Télécharger"],
          defaultId: 1,
          cancelId: 0,
        });
        if (r.response === 1)
          void autoUpdater.downloadUpdate().catch(console.error);
      });
      autoUpdater.on("update-downloaded", async () => {
        const r = await dialog.showMessageBox(win, {
          message: "La mise à jour est prête. Redémarrer TaskFlow ?",
          buttons: ["Plus tard", "Redémarrer"],
          cancelId: 0,
        });
        if (r.response === 1) {
          quitting = true;
          autoUpdater.quitAndInstall();
        }
      });
      if (
        app.isPackaged &&
        existsSync(join(process.resourcesPath, "app-update.yml"))
      )
        void autoUpdater.checkForUpdates().catch(console.error);
    })
    .catch((e) => {
      console.error(e);
      dialog.showErrorBox("TaskFlow — démarrage impossible", String(e));
      app.exit(1);
    });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    clearInterval(timer);
    globalShortcut.unregisterAll();
    store?.close();
  });
  app.on("activate", () => {
    if (win) show();
  });
}
