import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
let app: ElectronApplication, page: Page, profile: string;
async function launch() {
  app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      resolve("apps/desktop"),
    ],
    env: { ...process.env, TASKFLOW_E2E: "1", TASKFLOW_USER_DATA: profile },
  });
  page = await app.firstWindow();
  await expect(
    page.getByRole("heading", { name: "Aujourd’hui", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Chargement des tâches" }),
  ).toHaveCount(0);
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "taskflow-e2e-"));
  await launch();
});
test.afterEach(async () => {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
});
async function create(text: string) {
  await page.keyboard.press("n");
  await page.getByLabel("Que faut-il faire ?").fill(text);
  await page
    .getByRole("button", { name: "Créer la tâche", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
// Start on the card padding, away from its nested buttons and selectable text.
// Two moves over the target ensure Chromium dispatches dragover before mouseup.
async function dragTask(source: Locator, target: Locator) {
  await page.evaluate(() => {
    (window as any).__dragEvents = [];
    for (const name of ["dragstart", "dragenter", "dragover", "drop", "dragend"]) {
      document.addEventListener(name, (event) => {
        const e = event as DragEvent;
        (window as any).__dragEvents.push({
          name, target: (e.target as HTMLElement)?.className,
          types: Array.from(e.dataTransfer?.types ?? []),
          id: e.dataTransfer?.getData("text/taskflow-id"),
          prevented: e.defaultPrevented,
        });
      });
    }
  });
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Zone de déplacement invisible");
  await page.mouse.move(from.x + 4, from.y + 4);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + 16, from.y + 8, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2 + 1);
  } finally {
    await page.mouse.up();
    console.log("Drag diagnostic", await page.evaluate(() => ({ events: (window as any).__dragEvents, error: document.querySelector(".error-banner")?.textContent, cards: Array.from(document.querySelectorAll(".board-column")).map(e => e.textContent) })));
    console.log("Task state", await page.evaluate(async () => (await window.taskflow.data.snapshot()).tasks.map(t => ({title:t.title,status:t.status}))));
  }
}
async function closeDetail() {
  await page.getByRole("button", { name: "Fermer les détails" }).click();
}
test("capture française, détail, sous-tâche, commentaire, suppression et annulation", async () => {
  await create("Relancer le client demain 10h #pro !haute");
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Relancer le client",
  );
  await expect(page.getByLabel("Priorité", { exact: true })).toHaveValue("1");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Offre de maintenance FE141E");
  await page.getByLabel("Effort (minutes)").fill("30");
  await page.getByLabel("Important", { exact: true }).check();
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(
    page.getByRole("button", { name: "Enregistrer les modifications" }),
  ).toBeDisabled();
  await page
    .getByLabel("Nouvelle sous-tâche")
    .fill("Vérifier le numéro de commande");
  await page.getByRole("button", { name: "Créer la sous-tâche" }).click();
  await expect(
    page.getByRole("button", {
      name: "Vérifier le numéro de commande",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Ajouter un commentaire")
    .fill("Le client confirme son arrêt de production.");
  await page.getByRole("button", { name: "Publier le commentaire" }).click();
  await expect(
    page.getByText("Le client confirme son arrêt de production.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Supprimer la tâche", exact: true })
    .click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("link", { name: "Liste", exact: true }).click();
  await expect(page.locator(".task-row")).toHaveCount(2);
});
test("projets, thème, commandes et persistance après redémarrage", async () => {
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page
    .getByLabel("Nom du projet", { exact: true })
    .fill("Rétrofit FE141E");
  await page.getByRole("button", { name: "Ajouter le projet" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Rétrofit FE141E", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Apparence").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Rétrofit FE141E", exact: true })
    .click();
  await create("Préparer les essais aujourd’hui !2");
  await closeDetail();
  await app.close();
  await launch();
  await page.getByRole("link", { name: "Liste", exact: true }).click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Rechercher une commande").fill("Focus");
  await page.getByRole("button", { name: "Ouvrir Focus", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Focus", exact: true }),
  ).toBeVisible();
});
test("déplacement Kanban, Matrice et calendrier ; récurrence", async () => {
  await create("Contrôle chaque mois !1");
  await closeDetail();
  await page.getByRole("link", { name: "Kanban", exact: true }).click();
  const target = page
    .locator(".board-column")
    .filter({ has: page.getByRole("heading", { name: "En cours" }) });
  await dragTask(page.locator(".task-row"), target);
  await expect(target.getByText("Contrôle", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Matrice", exact: true }).click();
  const q = page
    .locator(".quadrant")
    .filter({ has: page.getByRole("heading", { name: "Faire maintenant" }) });
  await dragTask(page.locator(".task-row"), q);
  await expect(q.getByText("Contrôle", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Calendrier", exact: true }).click();
  await expect(page.locator(".calendar-task")).toHaveCount(1);
  const cell = page
      .locator(".calendar-day")
      .filter({ hasNot: page.locator(".calendar-task") })
      .nth(10),
    day = await cell.getAttribute("data-day");
  await dragTask(page.locator(".calendar-task"), cell);
  await expect(cell.locator(".calendar-task")).toHaveCount(1);
  expect(
    (await page.evaluate(() => window.taskflow.data.snapshot())).tasks[0]
      .dueDate,
  ).toBe(day);
  await page.getByRole("link", { name: "Liste", exact: true }).click();
  await page
    .getByRole("button", { name: "Terminer Contrôle", exact: true })
    .click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  await expect.poll(async () =>
    (await page.evaluate(() => window.taskflow.data.snapshot())).tasks.length,
  ).toBe(2);
  const snapshot = await page.evaluate(() => window.taskflow.data.snapshot());
  expect(snapshot.tasks).toHaveLength(2);
  expect(snapshot.tasks.filter((t) => t.status === "done")).toHaveLength(1);
});
test("isolation et validation IPC", async () => {
  expect(
    await page.evaluate(() => ({
      require: typeof (window as any).require,
      process: typeof (window as any).process,
      ipc: typeof (window.taskflow as any).invoke,
    })),
  ).toEqual({ require: "undefined", process: "undefined", ipc: "undefined" });
  expect(
    await page.evaluate(async () => {
      try {
        await window.taskflow.data.createTask({
          title: "",
          priority: 99,
        } as any);
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = (
      BrowserWindow.getAllWindows()[0].webContents as any
    ).getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
    };
  });
  expect(prefs).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  });
  await create("<img src=x onerror=alert(1)> aujourd’hui");
  await expect(page.locator(".task-title img")).toHaveCount(0);
});
test("pièce jointe copiée et liée", async () => {
  const source = join(profile, "specification.txt");
  await writeFile(source, "Document de test TaskFlow");
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, source);
  await create("Vérifier la spécification");
  await page
    .getByRole("button", { name: "Joindre un document", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /specification.txt/ }),
  ).toBeVisible();
  const files = await page.evaluate(async () => {
    const s = await window.taskflow.data.snapshot();
    return window.taskflow.data.attachments(s.tasks[0].id);
  });
  expect(files).toHaveLength(1);
});
test("captures clair / sombre, 1280 / 1920", async () => {
  test.setTimeout(90000);
  await page.evaluate(async () => {
    const d = window.taskflow.data,
      p = await d.saveProject({ name: "Rétrofit FE141E" }),
      tag = await d.saveTag({ name: "client" }),
      date = new Date(),
      day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    for (const [i, title] of [
      "Confirmer l’arrêt de production",
      "Envoyer l’offre des hublots",
      "Préparer le passage des câbles",
      "Valider la table d’échange",
      "Relancer le bon de commande",
      "Planifier les essais de soudage",
    ].entries())
      await d.createTask({
        title,
        description:
          "Coordonner les points ouverts avant l’intervention sur site.",
        parentId: null,
        projectId: p.id,
        dueDate: day,
        reminderAt: null,
        priority: (i % 4) + 1,
        urgent: i % 2 === 0,
        important: i < 3,
        effort: 30,
        status: i % 3 === 0 ? "doing" : i % 3 === 1 ? "todo" : "waiting",
        recurrence: null,
        tagIds: [tag.id],
      });
  });
  await page.reload();
  await expect(page.locator(".task-row")).toHaveCount(6);
  await mkdir("docs/screenshots", { recursive: true });
  for (const [width, height] of [
    [1280, 800],
    [1920, 1080],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setSize(size.width, size.height),
      { width, height },
    );
    for (const theme of ["light", "dark"] as const) {
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
      await page.getByLabel("Apparence").selectOption(theme);
      await page.keyboard.press("Escape");
      for (const [route, label] of [
        ["today", "Aujourd’hui"],
        ["upcoming", "À venir"],
        ["list", "Liste"],
        ["kanban", "Kanban"],
        ["calendar", "Calendrier"],
        ["matrix", "Matrice"],
        ["focus", "Focus"],
      ]) {
        await page
          .getByRole("link", { name: label, exact: route !== "today" })
          .click();
        await page.screenshot({
          path: `docs/screenshots/${route}-${theme}-${width}.png`,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.getByRole("link", { name: "Liste", exact: true }).click();
      await page
        .locator(".task-open")
        .filter({ hasText: "Confirmer l’arrêt de production" })
        .click();
      await page.screenshot({
        path: `docs/screenshots/detail-${theme}-${width}.png`,
      });
      await closeDetail();
      await page.keyboard.press("Control+k");
      await page
        .getByRole("button", { name: "Système de design", exact: true })
        .click();
      await page.screenshot({
        path: `docs/screenshots/design-${theme}-${width}.png`,
      });
    }
  }
});
