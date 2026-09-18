import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  notebookInput,
  sectionInput,
  pageInput,
  noteId,
  revisionSchema,
  walkNotes,
  plainText,
  taskInputSchema,
  taskDto,
  type NotesSnapshot,
  type NotePage,
  type NoteKind,
  type RichNode,
  type SearchHit,
  type Task,
  type TaskInput,
} from "@taskflow/core";
export class NotesRepository {
  constructor(
    private db: Database.Database,
    private task: (id: string) => Task,
    private createTask: (i: TaskInput) => Task,
    private updateTask: (id: string, r: number, i: TaskInput) => Task,
  ) {}
  private table(kind: NoteKind) {
    return (
      {
        notebook: "notebooks",
        section: "note_sections",
        page: "note_pages",
      } as const
    )[z.enum(["notebook", "section", "page"]).parse(kind)];
  }
  private active(kind: NoteKind, id: string): any {
    noteId.parse(id);
    const r = this.db
      .prepare(
        `SELECT * FROM ${this.table(kind)} WHERE id=? AND deleted_at IS NULL`,
      )
      .get(id);
    if (!r) throw new Error("Élément introuvable ou supprimé.");
    return r;
  }
  private check(row: any, revision: number | undefined) {
    if (row.revision !== revisionSchema.parse(revision))
      throw new Error(
        "Cette page ou ce dossier a changé. Rechargez avant de réessayer.",
      );
  }
  private page(row: any): NotePage {
    return {
      id: row.id,
      sectionId: row.section_id,
      title: row.title,
      content: JSON.parse(row.content),
      revision: row.revision,
      updatedAt: row.updated_at,
    };
  }
  snapshot(): NotesSnapshot {
    return {
      notebooks: this.db
        .prepare(
          "SELECT id,name,revision FROM notebooks WHERE deleted_at IS NULL ORDER BY name,id",
        )
        .all() as any,
      sections: this.db
        .prepare(
          "SELECT id,notebook_id AS notebookId,name,revision FROM note_sections WHERE deleted_at IS NULL ORDER BY name,id",
        )
        .all() as any,
      pages: (
        this.db
          .prepare(
            "SELECT * FROM note_pages WHERE deleted_at IS NULL ORDER BY updated_at DESC,id",
          )
          .all() as any[]
      ).map((r) => this.page(r)),
    };
  }
  saveNotebook(raw: unknown) {
    const t = notebookInput.parse(raw);
    return this.db.transaction(() => {
      if (t.id) this.check(this.active("notebook", t.id), t.revision);
      const id = t.id ?? randomUUID();
      this.db
        .prepare(
          "INSERT INTO notebooks(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=revision+1",
        )
        .run(id, t.name);
      return this.snapshot().notebooks.find((n) => n.id === id)!;
    })();
  }
  saveSection(raw: unknown) {
    const t = sectionInput.parse(raw);
    return this.db.transaction(() => {
      this.active("notebook", t.notebookId);
      if (t.id) this.check(this.active("section", t.id), t.revision);
      const id = t.id ?? randomUUID();
      this.db
        .prepare(
          "INSERT INTO note_sections(id,notebook_id,name) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,notebook_id=excluded.notebook_id,revision=revision+1",
        )
        .run(id, t.notebookId, t.name);
      return this.snapshot().sections.find((n) => n.id === id)!;
    })();
  }
  savePage(raw: unknown): NotePage {
    const t = pageInput.parse(raw);
    return this.db.transaction(() => {
      this.active("section", t.sectionId);
      if (t.id) this.check(this.active("page", t.id), t.revision);
      const id = t.id ?? randomUUID(),
        content = t.content;
      const links = this.db
        .prepare("SELECT item_id,task_id FROM page_checklist WHERE page_id=?")
        .all(id) as { item_id: string; task_id: string }[];
      const retained = new Set<string>();
      walkNotes(content, (n) => {
        if (n.type !== "taskItem") return;
        n.attrs ??= {};
        n.attrs.itemId ??= randomUUID();
        retained.add(n.attrs.itemId);
        const link = links.find((l) => l.item_id === n.attrs!.itemId);
        if (n.attrs.taskId && n.attrs.taskId !== link?.task_id)
          throw new Error(
            "Lien checklist non autorisé. Utilisez Transformer en tâche.",
          );
        n.attrs.taskId = link?.task_id ?? null;
        if (link) {
          let task: Task;
          try {
            task = this.task(link.task_id);
          } catch {
            return;
          }
          const checked = !!n.attrs.checked;
          if (checked !== (task.status === "done"))
            this.updateTask(task.id, task.revision, {
              ...taskDto(task),
              status: checked ? "done" : "todo",
            });
        }
      });
      for (const l of links)
        if (!retained.has(l.item_id))
          this.db
            .prepare("DELETE FROM page_checklist WHERE page_id=? AND item_id=?")
            .run(id, l.item_id);
      this.db
        .prepare(
          "INSERT INTO note_pages(id,section_id,title,content,plain_text,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET section_id=excluded.section_id,title=excluded.title,content=excluded.content,plain_text=excluded.plain_text,updated_at=excluded.updated_at,revision=revision+1",
        )
        .run(
          id,
          t.sectionId,
          t.title,
          JSON.stringify(content),
          plainText(content),
          new Date().toISOString(),
        );
      return this.page(this.active("page", id));
    })();
  }
  linkChecklist(
    pageId: string,
    revision: number,
    itemId: string,
    taskId: string | null,
  ) {
    noteId.parse(itemId);
    return this.db.transaction(() => {
      const row = this.active("page", pageId);
      this.check(row, revision);
      const doc = JSON.parse(row.content) as RichNode;
      let item: RichNode | undefined;
      walkNotes(doc, (n) => {
        if (n.type === "taskItem" && n.attrs?.itemId === itemId) item = n;
      });
      if (!item) throw new Error("Enregistrez la checklist avant de la lier.");
      const existing = this.db
        .prepare(
          "SELECT task_id FROM page_checklist WHERE page_id=? AND item_id=?",
        )
        .get(pageId, itemId) as { task_id: string } | undefined;
      if (existing) {
        if (taskId && taskId !== existing.task_id)
          throw new Error("Cet élément est déjà lié.");
        return this.page(row);
      }
      const task = taskId
        ? this.task(taskId)
        : this.createTask(
            taskInputSchema.parse({
              title:
                plainText(item).trim().slice(0, 500) || "Action de la page",
              status: item.attrs?.checked ? "done" : "todo",
            }),
          );
      this.db
        .prepare(
          "INSERT INTO page_checklist(page_id,item_id,task_id) VALUES(?,?,?)",
        )
        .run(pageId, itemId, task.id);
      item.attrs = {
        ...item.attrs,
        taskId: task.id,
        checked: task.status === "done",
      };
      this.db
        .prepare(
          "UPDATE note_pages SET content=?,revision=revision+1,updated_at=? WHERE id=?",
        )
        .run(JSON.stringify(doc), new Date().toISOString(), pageId);
      return this.page(this.active("page", pageId));
    })();
  }
  syncTask(task: Task) {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT p.* FROM note_pages p JOIN page_checklist l ON p.id=l.page_id WHERE l.task_id=?",
      )
      .all(task.id) as any[];
    for (const row of rows) {
      const doc = JSON.parse(row.content) as RichNode;
      let changed = false;
      walkNotes(doc, (n) => {
        if (
          n.type === "taskItem" &&
          n.attrs?.taskId === task.id &&
          n.attrs.checked !== (task.status === "done")
        ) {
          n.attrs.checked = task.status === "done";
          changed = true;
        }
      });
      if (changed)
        this.db
          .prepare(
            "UPDATE note_pages SET content=?,revision=revision+1,updated_at=? WHERE id=?",
          )
          .run(JSON.stringify(doc), new Date().toISOString(), row.id);
    }
  }
  delete(kind: NoteKind, id: string, revision: number) {
    return this.db.transaction(() => {
      const row = this.active(kind, id);
      this.check(row, revision);
      const token = randomUUID();
      const stamp = new Date().toISOString();
      const set = (table: string, where: string, args: unknown[]) =>
        this.db
          .prepare(
            `UPDATE ${table} SET deleted_at=?,delete_token=?,revision=revision+1 WHERE deleted_at IS NULL AND (${where})`,
          )
          .run(stamp, token, ...args);
      if (kind === "notebook") {
        set(
          "note_pages",
          "section_id IN(SELECT id FROM note_sections WHERE notebook_id=?)",
          [id],
        );
        set("note_sections", "notebook_id=?", [id]);
      }
      if (kind === "section") set("note_pages", "section_id=?", [id]);
      set(this.table(kind), "id=?", [id]);
      return token;
    })();
  }
  restore(token: string) {
    noteId.parse(token);
    this.db.transaction(() => {
      const sections = this.db
        .prepare("SELECT notebook_id FROM note_sections WHERE delete_token=?")
        .all(token) as any[];
      const pages = this.db
        .prepare("SELECT section_id FROM note_pages WHERE delete_token=?")
        .all(token) as any[];
      for (const r of sections) {
        const p = this.db
          .prepare("SELECT deleted_at,delete_token FROM notebooks WHERE id=?")
          .get(r.notebook_id) as any;
        if (p.deleted_at && p.delete_token !== token)
          throw new Error("Restaurez d’abord le carnet.");
      }
      for (const r of pages) {
        const p = this.db
          .prepare(
            "SELECT deleted_at,delete_token FROM note_sections WHERE id=?",
          )
          .get(r.section_id) as any;
        if (p.deleted_at && p.delete_token !== token)
          throw new Error("Restaurez d’abord la section.");
      }
      let count = 0;
      for (const table of ["notebooks", "note_sections", "note_pages"])
        count += this.db
          .prepare(
            `UPDATE ${table} SET deleted_at=NULL,delete_token=NULL,revision=revision+1 WHERE delete_token=?`,
          )
          .run(token).changes;
      if (!count) throw new Error("Suppression introuvable ou déjà annulée.");
    })();
  }
  search(raw: string): SearchHit[] {
    const q = z.string().trim().max(200).parse(raw);
    if (!q) return [];
    const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    const pages = this.db
      .prepare(
        "SELECT id,title,plain_text AS body FROM note_pages WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR plain_text LIKE ? ESCAPE '\\') LIMIT 50",
      )
      .all(pattern, pattern) as any[];
    const tasks = this.db
      .prepare(
        "SELECT id,title,description AS body FROM tasks WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') LIMIT 50",
      )
      .all(pattern, pattern) as any[];
    return [
      ...pages.map((r) => ({ ...r, kind: "page" })),
      ...tasks.map((r) => ({ ...r, kind: "task" })),
    ].map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      excerpt: String(r.body).slice(0, 200),
    }));
  }
}
