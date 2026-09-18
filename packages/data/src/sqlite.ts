import { NotesRepository } from "./notes";
import type { NoteKind } from "@taskflow/core";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  taskInputSchema,
  idSchema,
  namedSchema,
  preferencesSchema,
  nextOccurrence,
  taskDto,
} from "@taskflow/core";
import type {
  Task,
  TaskInput,
  Project,
  Tag,
  Comment,
  Attachment,
  Preferences,
  DataStore,
  Snapshot,
} from "./index";
import { migrations } from "./migrations";
type Row = Record<string, unknown>;
export class SqliteDataStore implements DataStore {
  readonly db: Database.Database;
  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("foreign_keys=ON");
    this.db.pragma("journal_mode=WAL");
    this.db.pragma("busy_timeout=5000");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    const version =
      (
        this.db
          .prepare("SELECT MAX(version) AS version FROM schema_migrations")
          .get() as { version: number | null }
      ).version ?? 0;
    if (version > migrations.length) {
      this.db.close();
      throw new Error("Base créée par une version plus récente de TaskFlow.");
    }
    for (const m of migrations)
      if (m.version > version)
        this.db.transaction(() => {
          this.db.exec(m.sql);
          this.db
            .prepare("INSERT INTO schema_migrations VALUES(?,?)")
            .run(m.version, new Date().toISOString());
        })();
  }
  private get notes() {
    return new NotesRepository(
      this.db,
      (id) => this.get(id),
      (i) => this.insert(i),
      (id, r, i) => this.updateTaskSync(id, r, i),
    );
  }
  async notesSnapshot() {
    return this.notes.snapshot();
  }
  async saveNotebook(i: Parameters<NotesRepository["saveNotebook"]>[0]) {
    return this.notes.saveNotebook(i);
  }
  async saveSection(i: Parameters<NotesRepository["saveSection"]>[0]) {
    return this.notes.saveSection(i);
  }
  async savePage(i: Parameters<NotesRepository["savePage"]>[0]) {
    return this.notes.savePage(i);
  }
  async deleteNote(kind: NoteKind, id: string, revision: number) {
    return this.notes.delete(kind, id, revision);
  }
  async restoreNote(token: string) {
    this.notes.restore(token);
  }
  async linkChecklist(
    id: string,
    r: number,
    itemId: string,
    taskId: string | null,
  ) {
    return this.notes.linkChecklist(id, r, itemId, taskId);
  }
  async searchAll(q: string) {
    return this.notes.search(q);
  }
  close() {
    this.db.close();
  }
  private map(r: Row): Task {
    return {
      id: String(r.id),
      title: String(r.title),
      description: String(r.description),
      parentId: r.parent_id as string | null,
      projectId: r.project_id as string | null,
      dueDate: r.due_date as string | null,
      reminderAt: r.reminder_at as string | null,
      priority: Number(r.priority),
      urgent: !!r.urgent,
      important: !!r.important,
      effort: Number(r.effort),
      status: r.status as Task["status"],
      recurrence: r.recurrence ? JSON.parse(String(r.recurrence)) : null,
      revision: Number(r.revision),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      completedAt: r.completed_at as string | null,
      recurrenceFrom: r.recurrence_from as string | null,
      tagIds: (
        this.db
          .prepare("SELECT tag_id FROM task_tags WHERE task_id=?")
          .all(r.id) as { tag_id: string }[]
      ).map((t) => t.tag_id),
    };
  }
  private get(id: string) {
    idSchema.parse(id);
    const r = this.db
      .prepare("SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL")
      .get(id) as Row | undefined;
    if (!r) throw new Error("Tâche introuvable ou supprimée.");
    return this.map(r);
  }
  async snapshot(): Promise<Snapshot> {
    return {
      tasks: (
        this.db
          .prepare(
            "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at,id",
          )
          .all() as Row[]
      ).map((r) => this.map(r)),
      projects: this.db
        .prepare("SELECT * FROM projects ORDER BY name")
        .all() as Project[],
      tags: this.db.prepare("SELECT * FROM tags ORDER BY name").all() as Tag[],
      preferences: this.preferences(),
    };
  }
  private links(t: TaskInput, id?: string) {
    if (t.parentId) {
      let p: Task | null = this.get(t.parentId);
      let depth = 0;
      while (p) {
        if (p.id === id)
          throw new Error("Une tâche ne peut pas contenir son propre parent.");
        if (p.status === "done" && t.status !== "done")
          throw new Error(
            "Rouvrez la tâche parente avant d’ajouter du travail.",
          );
        if (++depth > 100) throw new Error("Profondeur maximale atteinte.");
        p = p.parentId ? this.get(p.parentId) : null;
      }
    }
    if (
      t.projectId &&
      !this.db.prepare("SELECT id FROM projects WHERE id=?").get(t.projectId)
    )
      throw new Error("Projet introuvable.");
    for (const tag of t.tagIds)
      if (!this.db.prepare("SELECT id FROM tags WHERE id=?").get(tag))
        throw new Error("Étiquette introuvable.");
  }
  private tags(id: string, tags: string[]) {
    this.db.prepare("DELETE FROM task_tags WHERE task_id=?").run(id);
    for (const tag of new Set(tags))
      this.db.prepare("INSERT INTO task_tags VALUES(?,?)").run(id, tag);
  }
  private insert(raw: TaskInput, from: string | null = null): Task {
    const t = taskInputSchema.parse(raw);
    this.links(t);
    const id = randomUUID(),
      now = new Date().toISOString(),
      r = t.recurrence
        ? {
            ...t.recurrence,
            anchorDay: t.recurrence.anchorDay ?? Number(t.dueDate!.slice(-2)),
          }
        : null;
    this.db
      .prepare(
        "INSERT INTO tasks(id,title,description,parent_id,project_id,due_date,reminder_at,priority,urgent,important,effort,status,recurrence,recurrence_from,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        t.title,
        t.description,
        t.parentId,
        t.projectId,
        t.dueDate,
        t.reminderAt,
        t.priority,
        +t.urgent,
        +t.important,
        t.effort,
        t.status,
        r ? JSON.stringify(r) : null,
        from,
        now,
        now,
        t.status === "done" ? now : null,
      );
    this.tags(id, t.tagIds);
    return this.get(id);
  }
  async createTask(input: TaskInput) {
    return this.db.transaction(() => this.insert(input))();
  }
  async updateTask(
    id: string,
    revision: number,
    raw: TaskInput,
  ): Promise<Task> {
    return this.updateTaskSync(id, revision, raw);
  }
  private updateTaskSync(id: string, revision: number, raw: TaskInput): Task {
    return this.db.transaction(() => {
      const old = this.get(id);
      z.number().int().positive().parse(revision);
      if (old.revision !== revision)
        throw new Error("Cette tâche a changé. Rechargez avant de réessayer.");
      const t = taskInputSchema.parse(raw);
      this.links(t, id);
      if (
        t.status === "done" &&
        this.db
          .prepare(
            "SELECT id FROM tasks WHERE parent_id=? AND deleted_at IS NULL AND status<>'done'",
          )
          .get(id)
      )
        throw new Error("Terminez les sous-tâches avant leur parent.");
      const now = new Date().toISOString(),
        r = t.recurrence
          ? {
              ...t.recurrence,
              anchorDay:
                t.dueDate !== old.dueDate
                  ? Number(t.dueDate!.slice(-2))
                  : (t.recurrence.anchorDay ?? Number(t.dueDate!.slice(-2))),
            }
          : null;
      this.db
        .prepare(
          "UPDATE tasks SET title=?,description=?,parent_id=?,project_id=?,due_date=?,reminder_at=?,reminder_sent_at=CASE WHEN reminder_at IS ? THEN reminder_sent_at ELSE NULL END,priority=?,urgent=?,important=?,effort=?,status=?,recurrence=?,revision=revision+1,updated_at=?,completed_at=? WHERE id=?",
        )
        .run(
          t.title,
          t.description,
          t.parentId,
          t.projectId,
          t.dueDate,
          t.reminderAt,
          t.reminderAt,
          t.priority,
          +t.urgent,
          +t.important,
          t.effort,
          t.status,
          r ? JSON.stringify(r) : null,
          now,
          t.status === "done" ? (old.completedAt ?? now) : null,
          id,
        );
      this.tags(id, t.tagIds);
      if (
        t.status === "done" &&
        old.status !== "done" &&
        r &&
        t.dueDate &&
        !this.db.prepare("SELECT id FROM tasks WHERE recurrence_from=?").get(id)
      ) {
        const dueDate = nextOccurrence(t.dueDate, r);
        let reminderAt: string | null = null;
        if (t.reminderAt) {
          const days = Math.round(
              (Date.parse(dueDate + "T12:00:00Z") -
                Date.parse(t.dueDate + "T12:00:00Z")) /
                86400000,
            ),
            d = new Date(t.reminderAt);
          d.setDate(d.getDate() + days);
          reminderAt = d.toISOString();
        }
        this.insert(
          { ...t, status: "todo", dueDate, reminderAt, recurrence: r },
          id,
        );
      }
      const result = this.get(id);
      this.notes.syncTask(result);
      return result;
    })();
  }
  async completeTask(id: string, revision: number) {
    return this.updateTask(id, revision, {
      ...taskDto(this.get(id)),
      status: "done",
    });
  }
  async deleteTask(id: string) {
    this.get(id);
    const token = randomUUID();
    this.db
      .prepare(
        "WITH RECURSIVE tree(id) AS(SELECT id FROM tasks WHERE id=? UNION ALL SELECT t.id FROM tasks t JOIN tree p ON t.parent_id=p.id) UPDATE tasks SET deleted_at=?,delete_token=?,revision=revision+1 WHERE id IN(SELECT id FROM tree) AND deleted_at IS NULL",
      )
      .run(id, new Date().toISOString(), token);
    return token;
  }
  async restoreDeletion(token: string) {
    idSchema.parse(token);
    this.db.transaction(() => {
      const rows = this.db
        .prepare("SELECT id,parent_id FROM tasks WHERE delete_token=?")
        .all(token) as { id: string; parent_id: string | null }[];
      if (!rows.length)
        throw new Error("Suppression déjà annulée ou introuvable.");
      for (const row of rows)
        if (
          row.parent_id &&
          !rows.some((r) => r.id === row.parent_id) &&
          this.get(row.parent_id).status === "done"
        )
          throw new Error(
            "Rouvrez le parent avant de restaurer ses sous-tâches.",
          );
      this.db
        .prepare(
          "UPDATE tasks SET deleted_at=NULL,delete_token=NULL,revision=revision+1 WHERE delete_token=?",
        )
        .run(token);
    })();
  }
  private named(
    table: "projects" | "tags",
    raw: { id?: string; name: string },
  ) {
    const t = namedSchema.parse(raw),
      id = t.id ?? randomUUID();
    if (t.id && !this.db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id))
      throw new Error("Élément introuvable.");
    try {
      this.db
        .prepare(
          `INSERT INTO ${table}(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
        )
        .run(id, t.name);
    } catch {
      throw new Error("Ce nom est déjà utilisé.");
    }
    return { id, name: t.name };
  }
  async saveProject(t: { id?: string; name: string }) {
    return this.named("projects", t);
  }
  async saveTag(t: { id?: string; name: string }) {
    return this.named("tags", t);
  }
  async comments(taskId: string) {
    this.get(taskId);
    return this.db
      .prepare(
        "SELECT id,task_id AS taskId,body,created_at AS createdAt FROM comments WHERE task_id=? ORDER BY created_at,id",
      )
      .all(taskId) as Comment[];
  }
  async addComment(taskId: string, body: string) {
    this.get(taskId);
    body = z.string().trim().min(1).max(10000).parse(body);
    const t = {
      id: randomUUID(),
      taskId,
      body,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO comments VALUES(@id,@taskId,@body,@createdAt)")
      .run(t);
    return t;
  }
  async attachments(taskId: string) {
    this.get(taskId);
    return this.db
      .prepare(
        "SELECT id,task_id AS taskId,name,size,created_at AS createdAt FROM attachments WHERE task_id=? ORDER BY created_at",
      )
      .all(taskId) as Attachment[];
  }
  addAttachment(taskId: string, id: string, name: string, size: number) {
    this.get(taskId);
    idSchema.parse(id);
    z.string().min(1).max(255).parse(name);
    z.number()
      .int()
      .min(0)
      .max(25 * 1024 * 1024)
      .parse(size);
    const t = { id, taskId, name, size, createdAt: new Date().toISOString() };
    this.db
      .prepare(
        "INSERT INTO attachments VALUES(@id,@taskId,@name,@size,@createdAt)",
      )
      .run(t);
    return t;
  }
  attachment(id: string) {
    idSchema.parse(id);
    const t = this.db
      .prepare(
        "SELECT id,task_id AS taskId,name,size,created_at AS createdAt FROM attachments WHERE id=?",
      )
      .get(id) as Attachment | undefined;
    if (!t) throw new Error("Pièce jointe introuvable.");
    this.get(t.taskId);
    return t;
  }
  private preferences(): Preferences {
    const r = this.db
      .prepare("SELECT value FROM preferences WHERE key='app'")
      .get() as { value: string } | undefined;
    return r
      ? preferencesSchema.parse(JSON.parse(r.value))
      : { theme: "system", launchAtLogin: false };
  }
  async setPreferences(raw: Preferences) {
    const t = preferencesSchema.parse(raw);
    this.db
      .prepare(
        "INSERT INTO preferences VALUES('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(t));
    return t;
  }
  dueReminders(now = new Date()) {
    return (
      this.db
        .prepare(
          "SELECT * FROM tasks WHERE deleted_at IS NULL AND status<>'done' AND reminder_at<=? AND reminder_sent_at IS NULL ORDER BY reminder_at LIMIT 20",
        )
        .all(now.toISOString()) as Row[]
    ).map((r) => this.map(r));
  }
  markReminderSent(id: string) {
    this.db
      .prepare("UPDATE tasks SET reminder_sent_at=? WHERE id=?")
      .run(new Date().toISOString(), id);
  }
}
