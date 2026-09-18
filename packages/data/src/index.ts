import type {
  NotesSnapshot,
  Notebook,
  NoteSection,
  NotePage,
  NoteKind,
  RichNode,
  SearchHit,
  MailSnapshot,
  MailAccount,
  MailAttachment as CachedMailAttachment,
  MailMessage,
  MailWaiting,
} from "@taskflow/core";
import type {
  Task,
  TaskInput,
  Project,
  Tag,
  Comment,
  Attachment,
  Preferences,
} from "@taskflow/core";
export interface Snapshot {
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  preferences: Preferences;
}
export interface DataStore {
  mailSnapshot(): Promise<MailSnapshot>;
  mailAttachments(messageId: string): Promise<CachedMailAttachment[]>;
  setMailRead(messageId: string, read: boolean): Promise<MailMessage>;
  linkMailTask(messageId: string, taskId: string | null): Promise<MailMessage>;
  createTaskFromMail(messageId: string, input: TaskInput): Promise<Task>;
  waitForMailReply(input: {
    messageId: string;
    expectedFrom: string;
    dueDate: string | null;
  }): Promise<MailWaiting>;
  resolveMailWaiting(id: string): Promise<void>;
  notesSnapshot(): Promise<NotesSnapshot>;
  saveNotebook(input: {
    id?: string;
    revision?: number;
    name: string;
  }): Promise<Notebook>;
  saveSection(input: {
    id?: string;
    revision?: number;
    notebookId: string;
    name: string;
  }): Promise<NoteSection>;
  savePage(input: {
    id?: string;
    revision?: number;
    sectionId: string;
    title: string;
    content: RichNode;
  }): Promise<NotePage>;
  deleteNote(kind: NoteKind, id: string, revision: number): Promise<string>;
  restoreNote(token: string): Promise<void>;
  linkChecklist(
    pageId: string,
    revision: number,
    itemId: string,
    taskId: string | null,
  ): Promise<NotePage>;
  searchAll(query: string): Promise<SearchHit[]>;
  snapshot(): Promise<Snapshot>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, revision: number, input: TaskInput): Promise<Task>;
  completeTask(id: string, revision: number): Promise<Task>;
  deleteTask(id: string): Promise<string>;
  restoreDeletion(token: string): Promise<void>;
  saveProject(input: { id?: string; name: string }): Promise<Project>;
  saveTag(input: { id?: string; name: string }): Promise<Tag>;
  comments(taskId: string): Promise<Comment[]>;
  addComment(taskId: string, body: string): Promise<Comment>;
  attachments(taskId: string): Promise<Attachment[]>;
  setPreferences(input: Preferences): Promise<Preferences>;
}
export interface DesktopHost {
  mailAuthStatus(): Promise<{
    googleConfigured: boolean;
    microsoftConfigured: boolean;
    encryptionAvailable: boolean;
  }>;
  connectMail(provider: "google" | "microsoft"): Promise<MailAccount>;
  disconnectMail(accountId: string): Promise<void>;
  captureAttachment(taskId: string): Promise<Attachment | null>;
  openAttachment(id: string): Promise<void>;
  windowAction(action: "minimize" | "maximize" | "close"): Promise<void>;
  onCapture(callback: () => void): () => void;
  onTaskChanged(callback: () => void): () => void;
  checkUpdates(): Promise<string>;
}
export type { Task, TaskInput, Project, Tag, Comment, Attachment, Preferences };
