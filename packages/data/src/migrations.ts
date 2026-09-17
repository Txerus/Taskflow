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
];
