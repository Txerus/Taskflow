import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SqliteDataStore } from "./sqlite";
import { migrations } from "./migrations";
import {
  emptyDocument,
  taskInputSchema,
  taskDto,
  type RichNode,
} from "@taskflow/core";
let store: SqliteDataStore;
beforeEach(() => {
  store = new SqliteDataStore(":memory:");
});
afterEach(() => store.close());
async function fixture() {
  const n = await store.saveNotebook({ name: "Clients" });
  const s = await store.saveSection({ notebookId: n.id, name: "Réunions" });
  const p = await store.savePage({
    sectionId: s.id,
    title: "Réunion de lancement",
    content: emptyDocument(),
  });
  return { n, s, p };
}
function checkDoc(): RichNode {
  return {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Envoyer le compte rendu" }],
              },
            ],
          },
        ],
      },
    ],
  };
}
describe("carnets SQLite", () => {
  it("crée et déplace des sections/pages avec révisions", async () => {
    const { s, p } = await fixture();
    const n2 = await store.saveNotebook({ name: "Personnel" });
    const moved = await store.saveSection({
      ...s,
      notebookId: n2.id,
      name: "Suivi",
    });
    expect(moved.revision).toBe(2);
    const s2 = await store.saveSection({ notebookId: n2.id, name: "Autre" });
    const p2 = await store.savePage({
      ...p,
      sectionId: s2.id,
      title: "Nouvelle réunion",
    });
    expect(p2.revision).toBe(2);
    expect(p2.sectionId).toBe(s2.id);
    await expect(
      store.savePage({ ...p, title: "Ancien brouillon" }),
    ).rejects.toThrow("changé");
  });
  it("supprime/restaure un arbre sans restaurer une suppression antérieure", async () => {
    const { n, s, p } = await fixture();
    const old = await store.deleteNote("page", p.id, p.revision);
    const p2 = await store.savePage({
      sectionId: s.id,
      title: "Autre",
      content: emptyDocument(),
    });
    const token = await store.deleteNote("notebook", n.id, n.revision);
    expect((await store.notesSnapshot()).pages).toHaveLength(0);
    await expect(store.restoreNote(old)).rejects.toThrow("section");
    await store.restoreNote(token);
    expect((await store.notesSnapshot()).pages.map((p) => p.id)).toEqual([
      p2.id,
    ]);
    await store.restoreNote(old);
    expect((await store.notesSnapshot()).pages).toHaveLength(2);
  });
  it("lie une checklist une seule fois et synchronise dans les deux sens", async () => {
    const { p } = await fixture();
    const saved = await store.savePage({ ...p, content: checkDoc() });
    const item = saved.content.content![0].content![0];
    const linked = await store.linkChecklist(
      saved.id,
      saved.revision,
      item.attrs!.itemId,
      null,
    );
    const same = await store.linkChecklist(
      linked.id,
      linked.revision,
      item.attrs!.itemId,
      null,
    );
    expect(same.id).toBe(linked.id);
    expect((await store.snapshot()).tasks).toHaveLength(1);
    const task = (await store.snapshot()).tasks[0];
    await store.completeTask(task.id, task.revision);
    const updated = (await store.notesSnapshot()).pages[0];
    expect(updated.content.content![0].content![0].attrs!.checked).toBe(true);
    expect(updated.revision).toBeGreaterThan(linked.revision);
    await expect(
      store.savePage({ ...linked, title: "Brouillon ancien" }),
    ).rejects.toThrow("changé");
    updated.content.content![0].content![0].attrs!.checked = false;
    await store.savePage(updated);
    expect((await store.snapshot()).tasks[0].status).toBe("todo");
  });
  it("recrée un lien si la tâche liée a été supprimée", async () => {
    const { p } = await fixture();
    const saved = await store.savePage({ ...p, content: checkDoc() });
    const itemId = saved.content.content![0].content![0].attrs!.itemId;
    const linked = await store.linkChecklist(
      saved.id,
      saved.revision,
      itemId,
      null,
    );
    const firstTask = (await store.snapshot()).tasks[0];
    await store.deleteTask(firstTask.id);
    const relinked = await store.linkChecklist(
      linked.id,
      linked.revision,
      itemId,
      null,
    );
    const tasks = (await store.snapshot()).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).not.toBe(firstTask.id);
    expect(relinked.content.content![0].content![0].attrs!.taskId).toBe(
      tasks[0].id,
    );
  });
  it("lie une tâche existante sans en créer une autre", async () => {
    const { p } = await fixture();
    const t = await store.createTask(
      taskInputSchema.parse({ title: "Action existante", status: "done" }),
    );
    const saved = await store.savePage({ ...p, content: checkDoc() });
    const linked = await store.linkChecklist(
      saved.id,
      saved.revision,
      saved.content.content![0].content![0].attrs!.itemId,
      t.id,
    );
    expect(linked.content.content![0].content![0].attrs!.checked).toBe(true);
    expect((await store.snapshot()).tasks).toHaveLength(1);
  });
  it("annule atomiquement une coche impossible sur un parent", async () => {
    const { p } = await fixture();
    const parent = await store.createTask(
      taskInputSchema.parse({ title: "Parent" }),
    );
    await store.createTask(
      taskInputSchema.parse({ title: "Enfant", parentId: parent.id }),
    );
    const saved = await store.savePage({ ...p, content: checkDoc() });
    const linked = await store.linkChecklist(
      saved.id,
      saved.revision,
      saved.content.content![0].content![0].attrs!.itemId,
      parent.id,
    );
    linked.content.content![0].content![0].attrs!.checked = true;
    await expect(store.savePage(linked)).rejects.toThrow("sous-tâches");
    expect(
      (await store.notesSnapshot()).pages[0].content.content![0].content![0]
        .attrs!.checked,
    ).toBe(false);
    expect(
      (await store.snapshot()).tasks.find((t) => t.id === parent.id)?.status,
    ).toBe("todo");
  });
  it("refuse les liens forgés et conserve les tâches après suppression de page", async () => {
    const { p } = await fixture();
    const content = checkDoc();
    content.content![0].content![0].attrs!.taskId = randomUUID();
    await expect(store.savePage({ ...p, content })).rejects.toThrow(
      "non autorisé",
    );
    const saved = await store.savePage({ ...p, content: checkDoc() });
    const linked = await store.linkChecklist(
      saved.id,
      saved.revision,
      saved.content.content![0].content![0].attrs!.itemId,
      null,
    );
    await store.deleteNote("page", linked.id, linked.revision);
    expect((await store.snapshot()).tasks).toHaveLength(1);
  });
  it("cherche pages/tâches et traite % comme texte littéral", async () => {
    const { p } = await fixture();
    await store.savePage({
      ...p,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Offre à 50%" }],
          },
        ],
      },
    });
    await store.createTask(taskInputSchema.parse({ title: "Offre client" }));
    expect(await store.searchAll("Offre")).toHaveLength(2);
    expect(await store.searchAll("%")).toHaveLength(1);
    expect(await store.searchAll("")).toHaveLength(0);
  });
  it("refuse HTML actif, images distantes et éléments inconnus", async () => {
    const { p } = await fixture();
    await expect(
      store.savePage({
        ...p,
        content: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: { src: "https://tracker.invalid/image.png" },
            },
          ],
        },
      }),
    ).rejects.toThrow();
    await expect(
      store.savePage({
        ...p,
        content: {
          type: "doc",
          content: [{ type: "script", text: "alert(1)" }],
        },
      }),
    ).rejects.toThrow();
  });
  it("préserve une base Phase 1 lors de la migration et du redémarrage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "taskflow-migration-")),
      file = join(dir, "old.db");
    let migrated: SqliteDataStore | undefined;
    try {
      const old = new Database(file);
      old.exec(
        "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
      );
      old.exec(migrations[0].sql);
      old
        .prepare("INSERT INTO schema_migrations VALUES(1,?)")
        .run(new Date().toISOString());
      old
        .prepare("INSERT INTO projects VALUES(?,?)")
        .run(randomUUID(), "Projet conservé");
      old.close();
      migrated = new SqliteDataStore(file);
      expect((await migrated.snapshot()).projects[0].name).toBe(
        "Projet conservé",
      );
      const n = await migrated.saveNotebook({ name: "Après migration" });
      migrated.close();
      migrated = new SqliteDataStore(file);
      expect((await migrated.notesSnapshot()).notebooks[0].id).toBe(n.id);
    } finally {
      migrated?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
