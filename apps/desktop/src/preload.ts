import { contextBridge, ipcRenderer } from "electron";
import type { DataStore, DesktopHost } from "@taskflow/data";
import { channels as c } from "./channels";
const invoke = async (channel: string, ...args: unknown[]) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const subscribe = (channel: string, cb: () => void) => {
  const listener = () => cb();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
const data: DataStore = {
  notesSnapshot: () => invoke(c.notesSnapshot),
  saveNotebook: (i) => invoke(c.saveNotebook, i),
  saveSection: (i) => invoke(c.saveSection, i),
  savePage: (i) => invoke(c.savePage, i),
  deleteNote: (kind, id, r) => invoke(c.deleteNote, kind, id, r),
  restoreNote: (token) => invoke(c.restoreNote, token),
  linkChecklist: (id, r, item, task) => invoke(c.linkChecklist, id, r, item, task),
  searchAll: (q) => invoke(c.searchAll, q),

  snapshot: () => invoke(c.snapshot),
  createTask: (i) => invoke(c.createTask, i),
  updateTask: (id, r, i) => invoke(c.updateTask, id, r, i),
  completeTask: (id, r) => invoke(c.completeTask, id, r),
  deleteTask: (id) => invoke(c.deleteTask, id),
  restoreDeletion: (t) => invoke(c.restoreDeletion, t),
  saveProject: (i) => invoke(c.saveProject, i),
  saveTag: (i) => invoke(c.saveTag, i),
  comments: (id) => invoke(c.comments, id),
  addComment: (id, b) => invoke(c.addComment, id, b),
  attachments: (id) => invoke(c.attachments, id),
  setPreferences: (i) => invoke(c.setPreferences, i),
};
const host: DesktopHost = {
  captureAttachment: (id) => invoke(c.captureAttachment, id),
  openAttachment: (id) => invoke(c.openAttachment, id),
  windowAction: (a) => invoke(c.windowAction, a),
  checkUpdates: () => invoke(c.checkUpdates),
  onCapture: (fn) => subscribe(c.capture, fn),
  onTaskChanged: (fn) => subscribe(c.changed, fn),
};
contextBridge.exposeInMainWorld("taskflow", { data, host });
