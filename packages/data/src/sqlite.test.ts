import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SqliteDataStore } from "./sqlite";
import { taskInputSchema, taskDto, type TaskInput } from "@taskflow/core";
const input = (title: string, extra: Partial<TaskInput> = {}) =>
  taskInputSchema.parse({ title, ...extra });
let store: SqliteDataStore, dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "taskflow-unit-"));
  store = new SqliteDataStore(join(dir, "test.db"));
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
describe("SQLite", () => {
  it("persiste et applique une fois les migrations", async () => {
    await store.createTask(input("Offre FE141"));
    store.close();
    store = new SqliteDataStore(join(dir, "test.db"));
    expect((await store.snapshot()).tasks[0].title).toBe("Offre FE141");
    expect(
      store.db.prepare("SELECT * FROM schema_migrations").all(),
    ).toHaveLength(3);
  });
  it("valide DTO et relations", async () => {
    await expect(
      store.createTask(input("A", { projectId: randomUUID() })),
    ).rejects.toThrow("Projet");
    await expect(
      store.createTask({ ...input("A"), priority: 8 }),
    ).rejects.toThrow();
  });
  it("refuse les modifications périmées", async () => {
    const t = await store.createTask(input("Offre"));
    await store.updateTask(t.id, t.revision, input("Offre 2"));
    await expect(
      store.updateTask(t.id, t.revision, input("Offre 3")),
    ).rejects.toThrow("changé");
  });
  it("empêche cycles et complétion parent prématurée", async () => {
    const p = await store.createTask(input("Parent")),
      c = await store.createTask(input("Enfant", { parentId: p.id }));
    await expect(
      store.updateTask(p.id, p.revision, input("Parent", { parentId: c.id })),
    ).rejects.toThrow("parent");
    await expect(store.completeTask(p.id, p.revision)).rejects.toThrow(
      "sous-tâches",
    );
  });
  it("restaure uniquement le bon sous-arbre", async () => {
    const p = await store.createTask(input("Parent")),
      c = await store.createTask(input("Enfant", { parentId: p.id })),
      x = await store.createTask(input("Déjà supprimée", { parentId: p.id }));
    await store.deleteTask(x.id);
    const token = await store.deleteTask(p.id);
    expect((await store.snapshot()).tasks).toHaveLength(0);
    await store.restoreDeletion(token);
    expect((await store.snapshot()).tasks.map((t) => t.id)).toEqual(
      expect.arrayContaining([p.id, c.id]),
    );
    expect((await store.snapshot()).tasks).toHaveLength(2);
  });
  it("ne duplique pas la prochaine occurrence", async () => {
    const t = await store.createTask(
      input("Contrôle", {
        dueDate: "2026-01-31",
        recurrence: { unit: "month", interval: 1 },
      }),
    );
    const done = await store.completeTask(t.id, t.revision);
    expect(
      (await store.snapshot()).tasks.find((x) => x.recurrenceFrom === t.id)
        ?.dueDate,
    ).toBe("2026-02-28");
    const reopened = await store.updateTask(t.id, done.revision, {
      ...taskDto(done),
      status: "todo",
    });
    await store.completeTask(t.id, reopened.revision);
    expect((await store.snapshot()).tasks).toHaveLength(2);
  });
  it("est atomique sur erreur", async () => {
    const tag = await store.saveTag({ name: "pro" }),
      t = await store.createTask(input("A", { tagIds: [tag.id] }));
    await expect(
      store.updateTask(
        t.id,
        t.revision,
        input("B", { tagIds: [randomUUID()] }),
      ),
    ).rejects.toThrow();
    expect((await store.snapshot()).tasks[0].tagIds).toEqual([tag.id]);
    expect((await store.snapshot()).tasks[0].title).toBe("A");
  });
  it("conserve commentaires documents préférences", async () => {
    const t = await store.createTask(input("A"));
    await store.addComment(t.id, "Réponse attendue");
    store.addAttachment(t.id, randomUUID(), "offre.pdf", 256);
    expect(await store.comments(t.id)).toHaveLength(1);
    expect(await store.attachments(t.id)).toHaveLength(1);
    await store.setPreferences({ theme: "dark", launchAtLogin: false });
    expect((await store.snapshot()).preferences.theme).toBe("dark");
  });
  it("ne rappelle pas deux fois ou une tâche supprimée", async () => {
    const a = await store.createTask(
      input("A", { reminderAt: "2026-01-01T09:00:00.000Z" }),
    );
    expect(store.dueReminders(new Date("2026-02-01"))).toHaveLength(1);
    store.markReminderSent(a.id);
    expect(store.dueReminders(new Date("2026-02-01"))).toHaveLength(0);
    const b = await store.createTask(
      input("B", { reminderAt: "2026-01-01T09:00:00.000Z" }),
    );
    await store.deleteTask(b.id);
    expect(store.dueReminders(new Date("2026-02-01"))).toHaveLength(0);
  });
  it("met en cache les mails et crée une tâche liée sans doublon", async () => {
    const account = store.mail.saveAccount({
      provider: "google",
      email: "test@example.com",
      displayName: "Compte test",
    });
    const raw = {
      accountId: account.id,
      providerMessageId: "msg-1",
      threadId: "thread-1",
      internetMessageId: "<msg-1@example.com>",
      subject: "Offre à relancer",
      from: { name: "Client", email: "client@example.com" },
      to: [{ name: "Moi", email: "test@example.com" }],
      cc: [],
      receivedAt: "2026-09-18T08:00:00.000Z",
      sentAt: null,
      snippet: "Pouvez-vous revenir vers nous ?",
      bodyText: "Bonjour, pouvez-vous revenir vers nous ?",
      unread: true,
      hasAttachments: true,
      folder: "inbox" as const,
    };
    const first = store.mail.upsertMessage(raw);
    const second = store.mail.upsertMessage({ ...raw, unread: false });
    expect(second.id).toBe(first.id);
    expect(second.unread).toBe(false);
    store.mail.replaceAttachments(first.id, [
      {
        providerAttachmentId: "att-1",
        name: "offre.pdf",
        mimeType: "application/pdf",
        size: 1234,
      },
    ]);
    expect(await store.mailAttachments(first.id)).toHaveLength(1);
    const task = await store.createTaskFromMail(
      first.id,
      input("Répondre à Offre à relancer"),
    );
    expect((await store.mailSnapshot()).messages[0].taskId).toBe(task.id);
    const waiting = await store.waitForMailReply({
      messageId: first.id,
      expectedFrom: "client@example.com",
      dueDate: "2026-09-25",
    });
    expect(waiting.resolvedAt).toBeNull();
    await store.resolveMailWaiting(waiting.id);
    expect((await store.mailSnapshot()).waiting[0].resolvedAt).not.toBeNull();
  });

  it("refuse une version future de DB", () => {
    store.db
      .prepare("INSERT INTO schema_migrations VALUES(99,?)")
      .run(new Date().toISOString());
    expect(() => new SqliteDataStore(join(dir, "test.db"))).toThrow(
      "plus récente",
    );
  });
});
