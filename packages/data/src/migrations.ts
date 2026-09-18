export const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE);
CREATE TABLE tags(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE);
CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 500),description TEXT NOT NULL DEFAULT '',parent_id TEXT REFERENCES tasks(id),project_id TEXT REFERENCES projects(id),due_date TEXT,reminder_at TEXT,reminder_sent_at TEXT,priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 4),urgent INTEGER NOT NULL CHECK(urgent IN(0,1)),important INTEGER NOT NULL CHECK(important IN(0,1)),effort INTEGER NOT NULL CHECK(effort>=0),status TEXT NOT NULL CHECK(status IN('todo','doing','waiting','done')),recurrence TEXT,recurrence_from TEXT UNIQUE REFERENCES tasks(id),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT,deleted_at TEXT,delete_token TEXT,CHECK(parent_id IS NULL OR parent_id<>id));
CREATE INDEX tasks_active_due ON tasks(deleted_at,status,due_date);
CREATE INDEX tasks_reminder ON tasks(reminder_at) WHERE deleted_at IS NULL AND reminder_sent_at IS NULL;
CREATE INDEX tasks_parent ON tasks(parent_id);CREATE INDEX tasks_project ON tasks(project_id);
CREATE TABLE task_tags(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,tag_id TEXT NOT NULL REFERENCES tags(id),PRIMARY KEY(task_id,tag_id));
CREATE TABLE comments(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),body TEXT NOT NULL,created_at TEXT NOT NULL);CREATE INDEX comments_task ON comments(task_id);
CREATE TABLE attachments(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),name TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);CREATE INDEX attachments_task ON attachments(task_id);
CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE notebooks(id TEXT PRIMARY KEY,name TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted_at TEXT,delete_token TEXT);
CREATE TABLE note_sections(id TEXT PRIMARY KEY,notebook_id TEXT NOT NULL REFERENCES notebooks(id),name TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted_at TEXT,delete_token TEXT);
CREATE INDEX note_sections_parent ON note_sections(notebook_id);
CREATE TABLE note_pages(id TEXT PRIMARY KEY,section_id TEXT NOT NULL REFERENCES note_sections(id),title TEXT NOT NULL,content TEXT NOT NULL,plain_text TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,deleted_at TEXT,delete_token TEXT);
CREATE INDEX note_pages_parent ON note_pages(section_id);
CREATE TABLE page_checklist(page_id TEXT NOT NULL REFERENCES note_pages(id),item_id TEXT NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id),PRIMARY KEY(page_id,item_id));
CREATE INDEX page_checklist_task ON page_checklist(task_id);
`,
  },
  {
    version: 3,
    sql: `
CREATE TABLE mail_accounts(id TEXT PRIMARY KEY,provider TEXT NOT NULL CHECK(provider IN('google','microsoft')),email TEXT NOT NULL COLLATE NOCASE,display_name TEXT NOT NULL DEFAULT '',last_sync_at TEXT,sync_cursor TEXT,created_at TEXT NOT NULL,UNIQUE(provider,email));
CREATE TABLE mail_messages(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,provider_message_id TEXT NOT NULL,thread_id TEXT,internet_message_id TEXT,subject TEXT NOT NULL DEFAULT '',sender_name TEXT NOT NULL DEFAULT '',sender_email TEXT NOT NULL,to_json TEXT NOT NULL DEFAULT '[]',cc_json TEXT NOT NULL DEFAULT '[]',received_at TEXT NOT NULL,sent_at TEXT,snippet TEXT NOT NULL DEFAULT '',body_text TEXT NOT NULL DEFAULT '',unread INTEGER NOT NULL CHECK(unread IN(0,1)),has_attachments INTEGER NOT NULL CHECK(has_attachments IN(0,1)),folder TEXT NOT NULL CHECK(folder IN('inbox','sent','archive','other')),task_id TEXT REFERENCES tasks(id),synced_at TEXT NOT NULL,UNIQUE(account_id,provider_message_id));
CREATE INDEX mail_messages_account_received ON mail_messages(account_id,received_at DESC);
CREATE INDEX mail_messages_unread ON mail_messages(account_id,unread,received_at DESC);
CREATE INDEX mail_messages_task ON mail_messages(task_id);
CREATE TABLE mail_attachments(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,provider_attachment_id TEXT NOT NULL,name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL CHECK(size>=0),UNIQUE(message_id,provider_attachment_id));
CREATE INDEX mail_attachments_message ON mail_attachments(message_id);
CREATE TABLE mail_waiting(id TEXT PRIMARY KEY,message_id TEXT NOT NULL UNIQUE REFERENCES mail_messages(id) ON DELETE CASCADE,expected_from TEXT NOT NULL COLLATE NOCASE,due_date TEXT,created_at TEXT NOT NULL,resolved_at TEXT);
CREATE INDEX mail_waiting_open ON mail_waiting(resolved_at,due_date);
CREATE TABLE mail_rules(id TEXT PRIMARY KEY,name TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),conditions_json TEXT NOT NULL,actions_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
`,
  },
];
