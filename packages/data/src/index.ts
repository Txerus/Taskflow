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
  captureAttachment(taskId: string): Promise<Attachment | null>;
  openAttachment(id: string): Promise<void>;
  windowAction(action: "minimize" | "maximize" | "close"): Promise<void>;
  onCapture(callback: () => void): () => void;
  onTaskChanged(callback: () => void): () => void;
  checkUpdates(): Promise<string>;
}
export type { Task, TaskInput, Project, Tag, Comment, Attachment, Preferences };
