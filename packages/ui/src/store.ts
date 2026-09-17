import { defineStore } from "pinia";
import { ref, inject, computed } from "vue";
import { storeKey } from "./context";
import {
  parseQuickTask,
  taskInputSchema,
  rankTasks,
  localDay,
  taskDto,
  type Task,
  type TaskInput,
  type Preferences,
} from "@taskflow/core";
import type { Snapshot } from "@taskflow/data";
export { taskDto };
export const useTasks = defineStore("tasks", () => {
  const data = inject(storeKey);
  if (!data) throw new Error("DataStore manquant");
  const snapshot = ref<Snapshot>({
    tasks: [],
    projects: [],
    tags: [],
    preferences: { theme: "system", launchAtLogin: false },
  });
  const loading = ref(true),
    busy = ref(false),
    error = ref(""),
    notice = ref(""),
    undoToken = ref<string | null>(null),
    selectedId = ref<string | null>(null),
    query = ref(""),
    projectFilter = ref(""),
    tagFilter = ref(""),
    showDone = ref(false),
    captureOpen = ref(false),
    paletteOpen = ref(false),
    settingsOpen = ref(false),
    editorDirty = ref(false),
    resetDraftSignal = ref(0),
    now = ref(new Date());
  const today = computed(() => localDay(now.value));
  function refreshClock() {
    now.value = new Date();
  }
  function discardDraft() {
    if (editorDirty.value) {
      if (!window.confirm("Abandonner les modifications non enregistrées ?"))
        return false;
      resetDraftSignal.value++;
    }
    editorDirty.value = false;
    return true;
  }
  function select(id: string | null) {
    if (id === selectedId.value) return;
    if (!discardDraft()) return;
    selectedId.value = id;
  }
  const selected = computed(
    () => snapshot.value.tasks.find((t) => t.id === selectedId.value) ?? null,
  );
  const tasks = computed(() =>
    rankTasks(
      snapshot.value.tasks.filter(
        (t) =>
          (showDone.value || t.status !== "done") &&
          (!projectFilter.value || t.projectId === projectFilter.value) &&
          (!tagFilter.value || t.tagIds.includes(tagFilter.value)) &&
          (!query.value ||
            `${t.title} ${t.description}`
              .toLocaleLowerCase("fr")
              .includes(query.value.toLocaleLowerCase("fr"))),
      ),
      now.value,
    ),
  );
  function message(e: unknown) {
    if (e instanceof Error) {
      try {
        const a = JSON.parse(e.message);
        if (Array.isArray(a)) return a.map((x) => x.message).join(" · ");
      } catch {}
      return e.message;
    }
    return "Opération impossible. Réessayez.";
  }
  async function load() {
    try {
      snapshot.value = await data!.snapshot();
      error.value = "";
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      return await fn();
    } catch (e) {
      error.value = message(e);
    } finally {
      busy.value = false;
    }
  }
  async function create(text: string, parentId: string | null = null) {
    if (!parentId && !discardDraft()) return;
    return run(async () => {
      const p = parseQuickTask(text),
        tagIds: string[] = [];
      for (const name of p.tagNames) {
        let tag = snapshot.value.tags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );
        tag ??= await data!.saveTag({ name });
        tagIds.push(tag.id);
      }
      const t = await data!.createTask({
        ...p.input,
        parentId,
        projectId: projectFilter.value || null,
        tagIds,
      });
      await load();
      if (!parentId) select(t.id);
      captureOpen.value = false;
      notice.value = "Tâche créée";
      return t;
    });
  }
  async function save(task: Task, input: TaskInput) {
    return run(async () => {
      const t = await data!.updateTask(
        task.id,
        task.revision,
        taskInputSchema.parse(input),
      );
      await load();
      notice.value = "Modifications enregistrées";
      return t;
    });
  }
  async function change(task: Task, patch: Partial<TaskInput>) {
    if (selectedId.value === task.id && !discardDraft()) return;
    return run(async () => {
      const before = snapshot.value.tasks;
      const input = { ...taskDto(task), ...patch };
      snapshot.value.tasks = before.map((t) =>
        t.id === task.id ? { ...t, ...patch } : t,
      );
      try {
        await data!.updateTask(task.id, task.revision, input);
        await load();
      } catch (e) {
        snapshot.value.tasks = before;
        throw e;
      }
    });
  }
  async function complete(task: Task) {
    return change(task, { status: task.status === "done" ? "todo" : "done" });
  }
  async function remove(task: Task) {
    if (selectedId.value === task.id && !discardDraft()) return;
    return run(async () => {
      undoToken.value = await data!.deleteTask(task.id);
      selectedId.value = null;
      await load();
      notice.value = "Tâche et sous-tâches supprimées";
    });
  }
  async function undo() {
    if (undoToken.value)
      return run(async () => {
        await data!.restoreDeletion(undoToken.value!);
        undoToken.value = null;
        await load();
        notice.value = "Suppression annulée";
      });
  }
  async function preferences(input: Preferences) {
    return run(async () => {
      snapshot.value.preferences = await data!.setPreferences(input);
      notice.value = "Préférences enregistrées";
    });
  }
  return {
    data,
    snapshot,
    loading,
    busy,
    error,
    notice,
    undoToken,
    selectedId,
    selected,
    query,
    projectFilter,
    tagFilter,
    showDone,
    captureOpen,
    paletteOpen,
    settingsOpen,
    editorDirty,
    resetDraftSignal,
    now,
    today,
    tasks,
    refreshClock,
    discardDraft,
    select,
    load,
    run,
    create,
    save,
    change,
    complete,
    remove,
    undo,
    preferences,
  };
});
