import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  idSchema,
  mailAccountInputSchema,
  mailAttachmentInputSchema,
  mailMessageInputSchema,
  mailRuleInputSchema,
  mailWaitingInputSchema,
  type MailAccount,
  type MailAttachment,
  type MailMessage,
  type MailMessageInput,
  type MailSnapshot,
  type MailRule,
  type MailWaiting,
} from "@taskflow/core";

type Row = Record<string, unknown>;

export class MailRepository {
  constructor(private readonly db: Database.Database) {}

  private account(r: Row): MailAccount {
    return {
      id: String(r.id),
      provider: r.provider as MailAccount["provider"],
      email: String(r.email),
      displayName: String(r.display_name),
      lastSyncAt: r.last_sync_at as string | null,
      syncCursor: r.sync_cursor as string | null,
      createdAt: String(r.created_at),
    };
  }

  private message(r: Row): MailMessage {
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      providerMessageId: String(r.provider_message_id),
      threadId: r.thread_id as string | null,
      internetMessageId: r.internet_message_id as string | null,
      subject: String(r.subject),
      from: { name: String(r.sender_name), email: String(r.sender_email) },
      to: JSON.parse(String(r.to_json)),
      cc: JSON.parse(String(r.cc_json)),
      receivedAt: String(r.received_at),
      sentAt: r.sent_at as string | null,
      snippet: String(r.snippet),
      bodyText: String(r.body_text),
      unread: !!r.unread,
      hasAttachments: !!r.has_attachments,
      folder: r.folder as MailMessage["folder"],
      taskId: r.task_id as string | null,
      syncedAt: String(r.synced_at),
    };
  }

  snapshot(limit = 500): MailSnapshot {
    const safeLimit = Math.max(1, Math.min(2000, Math.trunc(limit)));
    return {
      accounts: (this.db
        .prepare("SELECT * FROM mail_accounts ORDER BY created_at,id")
        .all() as Row[]).map((r) => this.account(r)),
      messages: (this.db
        .prepare(
          "SELECT * FROM mail_messages ORDER BY received_at DESC,id LIMIT ?",
        )
        .all(safeLimit) as Row[]).map((r) => this.message(r)),
      waiting: (this.db
        .prepare(
          "SELECT * FROM mail_waiting ORDER BY resolved_at IS NOT NULL,due_date,created_at",
        )
        .all() as Row[]).map(
        (r): MailWaiting => ({
          id: String(r.id),
          messageId: String(r.message_id),
          expectedFrom: String(r.expected_from),
          dueDate: r.due_date as string | null,
          createdAt: String(r.created_at),
          resolvedAt: r.resolved_at as string | null,
        }),
      ),
      rules: (this.db
        .prepare("SELECT * FROM mail_rules ORDER BY name,id")
        .all() as Row[]).map((r) => this.rule(r)),
    };
  }

  private rule(r: Row): MailRule {
    const conditions = JSON.parse(String(r.conditions_json)) as {
      senderContains?: string;
      subjectContains?: string;
      unreadOnly?: boolean;
    };
    const actions = JSON.parse(String(r.actions_json)) as {
      createTask?: boolean;
      priority?: 1 | 2 | 3 | 4;
    };
    return {
      id: String(r.id),
      name: String(r.name),
      enabled: !!r.enabled,
      senderContains: conditions.senderContains ?? "",
      subjectContains: conditions.subjectContains ?? "",
      unreadOnly: !!conditions.unreadOnly,
      createTask: actions.createTask !== false,
      priority: actions.priority ?? 3,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  saveRule(raw: unknown): MailRule {
    const input = mailRuleInputSchema.parse(raw);
    const old = input.id
      ? (this.db.prepare("SELECT * FROM mail_rules WHERE id=?").get(input.id) as
          | Row
          | undefined)
      : undefined;
    const id = old ? String(old.id) : (input.id ?? randomUUID());
    const now = new Date().toISOString();
    const conditions = JSON.stringify({
      senderContains: input.senderContains,
      subjectContains: input.subjectContains,
      unreadOnly: input.unreadOnly,
    });
    const actions = JSON.stringify({
      createTask: input.createTask,
      priority: input.priority,
    });
    if (old)
      this.db
        .prepare(
          "UPDATE mail_rules SET name=?,enabled=?,conditions_json=?,actions_json=?,updated_at=? WHERE id=?",
        )
        .run(input.name, +input.enabled, conditions, actions, now, id);
    else
      this.db
        .prepare(
          "INSERT INTO mail_rules(id,name,enabled,conditions_json,actions_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id, input.name, +input.enabled, conditions, actions, now, now);
    return this.rule(
      this.db.prepare("SELECT * FROM mail_rules WHERE id=?").get(id) as Row,
    );
  }

  deleteRule(id: string) {
    idSchema.parse(id);
    const info = this.db.prepare("DELETE FROM mail_rules WHERE id=?").run(id);
    if (!info.changes) throw new Error("Règle mail introuvable.");
  }

  matchingRules(message: MailMessage) {
    const sender = message.from.email.toLocaleLowerCase("fr");
    const subject = message.subject.toLocaleLowerCase("fr");
    return this.snapshot().rules.filter(
      (rule) =>
        rule.enabled &&
        (!rule.unreadOnly || message.unread) &&
        (!rule.senderContains ||
          sender.includes(rule.senderContains.toLocaleLowerCase("fr"))) &&
        (!rule.subjectContains ||
          subject.includes(rule.subjectContains.toLocaleLowerCase("fr"))),
    );
  }

  saveAccount(raw: unknown): MailAccount {
    const a = mailAccountInputSchema.parse(raw);
    const existing = a.id
      ? (this.db.prepare("SELECT * FROM mail_accounts WHERE id=?").get(a.id) as
          | Row
          | undefined)
      : (this.db
          .prepare("SELECT * FROM mail_accounts WHERE provider=? AND email=?")
          .get(a.provider, a.email) as Row | undefined);
    const id = existing ? String(existing.id) : (a.id ?? randomUUID());
    if (existing) {
      this.db
        .prepare(
          "UPDATE mail_accounts SET email=?,display_name=?,last_sync_at=?,sync_cursor=? WHERE id=?",
        )
        .run(a.email, a.displayName, a.lastSyncAt, a.syncCursor, id);
    } else {
      this.db
        .prepare(
          "INSERT INTO mail_accounts(id,provider,email,display_name,last_sync_at,sync_cursor,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          a.provider,
          a.email,
          a.displayName,
          a.lastSyncAt,
          a.syncCursor,
          new Date().toISOString(),
        );
    }
    return this.account(
      this.db.prepare("SELECT * FROM mail_accounts WHERE id=?").get(id) as Row,
    );
  }

  removeAccount(id: string) {
    idSchema.parse(id);
    const info = this.db.prepare("DELETE FROM mail_accounts WHERE id=?").run(id);
    if (!info.changes) throw new Error("Compte mail introuvable.");
  }

  upsertMessage(raw: MailMessageInput): MailMessage {
    const m = mailMessageInputSchema.parse(raw);
    if (!this.db.prepare("SELECT id FROM mail_accounts WHERE id=?").get(m.accountId))
      throw new Error("Compte mail introuvable.");
    const old = this.db
      .prepare(
        "SELECT id,task_id FROM mail_messages WHERE account_id=? AND provider_message_id=?",
      )
      .get(m.accountId, m.providerMessageId) as
      | { id: string; task_id: string | null }
      | undefined;
    const id = old?.id ?? randomUUID();
    const now = new Date().toISOString();
    if (old) {
      this.db
        .prepare(
          "UPDATE mail_messages SET thread_id=?,internet_message_id=?,subject=?,sender_name=?,sender_email=?,to_json=?,cc_json=?,received_at=?,sent_at=?,snippet=?,body_text=?,unread=?,has_attachments=?,folder=?,synced_at=? WHERE id=?",
        )
        .run(
          m.threadId,
          m.internetMessageId,
          m.subject,
          m.from.name,
          m.from.email,
          JSON.stringify(m.to),
          JSON.stringify(m.cc),
          m.receivedAt,
          m.sentAt,
          m.snippet,
          m.bodyText,
          +m.unread,
          +m.hasAttachments,
          m.folder,
          now,
          id,
        );
    } else {
      this.db
        .prepare(
          "INSERT INTO mail_messages(id,account_id,provider_message_id,thread_id,internet_message_id,subject,sender_name,sender_email,to_json,cc_json,received_at,sent_at,snippet,body_text,unread,has_attachments,folder,task_id,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          m.accountId,
          m.providerMessageId,
          m.threadId,
          m.internetMessageId,
          m.subject,
          m.from.name,
          m.from.email,
          JSON.stringify(m.to),
          JSON.stringify(m.cc),
          m.receivedAt,
          m.sentAt,
          m.snippet,
          m.bodyText,
          +m.unread,
          +m.hasAttachments,
          m.folder,
          null,
          now,
        );
    }
    return this.getMessage(id);
  }

  getMessage(id: string): MailMessage {
    idSchema.parse(id);
    const row = this.db.prepare("SELECT * FROM mail_messages WHERE id=?").get(id) as
      | Row
      | undefined;
    if (!row) throw new Error("E-mail introuvable.");
    return this.message(row);
  }

  setRead(id: string, read: boolean) {
    const m = this.getMessage(id);
    this.db.prepare("UPDATE mail_messages SET unread=? WHERE id=?").run(+!read, id);
    return { ...m, unread: !read };
  }

  linkTask(messageId: string, taskId: string | null) {
    this.getMessage(messageId);
    if (taskId) {
      idSchema.parse(taskId);
      if (!this.db.prepare("SELECT id FROM tasks WHERE id=? AND deleted_at IS NULL").get(taskId))
        throw new Error("Tâche introuvable.");
    }
    this.db.prepare("UPDATE mail_messages SET task_id=? WHERE id=?").run(taskId, messageId);
    return this.getMessage(messageId);
  }

  replaceAttachments(messageId: string, raw: unknown[]): MailAttachment[] {
    this.getMessage(messageId);
    const items = raw.map((x) => mailAttachmentInputSchema.parse(x));
    return this.db.transaction(() => {
      this.db.prepare("DELETE FROM mail_attachments WHERE message_id=?").run(messageId);
      for (const a of items)
        this.db
          .prepare(
            "INSERT INTO mail_attachments(id,message_id,provider_attachment_id,name,mime_type,size) VALUES(?,?,?,?,?,?)",
          )
          .run(randomUUID(), messageId, a.providerAttachmentId, a.name, a.mimeType, a.size);
      return this.attachments(messageId);
    })();
  }

  attachments(messageId: string): MailAttachment[] {
    this.getMessage(messageId);
    return (this.db
      .prepare("SELECT * FROM mail_attachments WHERE message_id=? ORDER BY name,id")
      .all(messageId) as Row[]).map(
      (r): MailAttachment => ({
        id: String(r.id),
        messageId: String(r.message_id),
        providerAttachmentId: String(r.provider_attachment_id),
        name: String(r.name),
        mimeType: String(r.mime_type),
        size: Number(r.size),
      }),
    );
  }

  waitForReply(raw: unknown): MailWaiting {
    const w = mailWaitingInputSchema.parse(raw);
    this.getMessage(w.messageId);
    const old = this.db
      .prepare("SELECT id FROM mail_waiting WHERE message_id=?")
      .get(w.messageId) as { id: string } | undefined;
    const id = old?.id ?? randomUUID();
    if (old)
      this.db
        .prepare(
          "UPDATE mail_waiting SET expected_from=?,due_date=?,resolved_at=NULL WHERE id=?",
        )
        .run(w.expectedFrom, w.dueDate, id);
    else
      this.db
        .prepare(
          "INSERT INTO mail_waiting(id,message_id,expected_from,due_date,created_at,resolved_at) VALUES(?,?,?,?,?,NULL)",
        )
        .run(id, w.messageId, w.expectedFrom, w.dueDate, new Date().toISOString());
    return this.snapshot().waiting.find((x) => x.id === id)!;
  }

  resolveMatchingReplies(message: MailMessage) {
    if (!message.threadId) return 0;
    const rows = this.db
      .prepare(
        "SELECT w.id FROM mail_waiting w JOIN mail_messages original ON original.id=w.message_id WHERE w.resolved_at IS NULL AND lower(w.expected_from)=lower(?) AND original.account_id=? AND original.thread_id=? AND original.id<>?",
      )
      .all(
        message.from.email,
        message.accountId,
        message.threadId,
        message.id,
      ) as { id: string }[];
    if (!rows.length) return 0;
    const now = new Date().toISOString();
    const update = this.db.prepare(
      "UPDATE mail_waiting SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
    );
    this.db.transaction(() => {
      for (const row of rows) update.run(now, row.id);
    })();
    return rows.length;
  }

  resolveWaiting(id: string) {
    idSchema.parse(id);
    const info = this.db
      .prepare("UPDATE mail_waiting SET resolved_at=? WHERE id=? AND resolved_at IS NULL")
      .run(new Date().toISOString(), id);
    if (!info.changes) throw new Error("Suivi d’attente introuvable ou déjà terminé.");
  }
}
