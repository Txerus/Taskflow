// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { taskInputSchema, type Task } from "@taskflow/core";
import { storeKey } from "./context";
import { useTasks } from "./store";
import App from "./App.vue";
import TaskWorkspace from "./views/TaskWorkspace.vue";
import DesignSystem from "./views/DesignSystem.vue";
import type { DataStore, Snapshot } from "@taskflow/data";
let wrapper: VueWrapper, state: Snapshot, deleted: Task[];
function data(): DataStore {
  return {
    notesSnapshot: async()=>({notebooks:[],sections:[],pages:[]}),
    saveNotebook: async()=>{throw new Error('Unused');}, saveSection: async()=>{throw new Error('Unused');}, savePage: async()=>{throw new Error('Unused');},
    deleteNote: async()=>{throw new Error('Unused');}, restoreNote: async()=>{}, linkChecklist: async()=>{throw new Error('Unused');}, searchAll:async()=>[],
    snapshot: async () => JSON.parse(JSON.stringify(state)),
    createTask: async (raw) => {
      const t = {
        ...taskInputSchema.parse(raw),
        id: crypto.randomUUID(),
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        recurrenceFrom: null,
      };
      state.tasks.push(t);
      return t;
    },
    updateTask: async (id, revision, input) => {
      // Electron IPC rejects Vue proxies, including nested tags/recurrence.
      structuredClone(input);
      const index = state.tasks.findIndex((t) => t.id === id);
      if (state.tasks[index].revision !== revision) throw new Error("Conflit");
      const t = { ...state.tasks[index], ...input, revision: revision + 1 };
      state.tasks[index] = t;
      return t;
    },
    completeTask: async () => {
      throw new Error("Unused");
    },
    deleteTask: async (id) => {
      deleted = state.tasks.filter((t) => t.id === id);
      state.tasks = state.tasks.filter((t) => t.id !== id);
      return crypto.randomUUID();
    },
    restoreDeletion: async () => {
      state.tasks.push(...deleted);
    },
    saveProject: async ({ name }) => {
      const p = { id: crypto.randomUUID(), name };
      state.projects.push(p);
      return p;
    },
    saveTag: async ({ name }) => {
      const t = { id: crypto.randomUUID(), name };
      state.tags.push(t);
      return t;
    },
    comments: async () => [],
    addComment: async (taskId, body) => ({
      id: crypto.randomUUID(),
      taskId,
      body,
      createdAt: new Date().toISOString(),
    }),
    attachments: async () => [],
    setPreferences: async (p) => {
      state.preferences = p;
      return p;
    },
  };
}
beforeEach(() => {
  state = {
    tasks: [],
    projects: [],
    tags: [],
    preferences: { theme: "light", launchAtLogin: false },
  };
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function boot(path = "/today") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/design", component: DesignSystem },
      { path: "/:view", component: TaskWorkspace },
    ],
  });
  await router.push(path);
  await router.isReady();
  const pinia = createPinia();
  wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      provide: { [storeKey as symbol]: data() },
    },
  });
  await flushPromises();
  return { router, store: useTasks(pinia) };
}
describe("interface Vue portable", () => {
  it("affiche le profil vide", async () => {
    await boot();
    expect(wrapper.text()).toContain("Rien à faire aujourd’hui");
    expect(wrapper.find(".capture-button").text()).toContain("Nouvelle tâche");
  });
  it("crée, affiche et sauvegarde le détail", async () => {
    const { store } = await boot("/list");
    await store.create("Relancer client demain #pro !haute");
    await flushPromises();
    expect(wrapper.find("#task-title").element).toHaveProperty(
      "value",
      "Relancer client",
    );
    expect(wrapper.findAll(".task-row")).toHaveLength(1);
    await wrapper.find("#task-description").setValue("Offre machine");
    await wrapper.find(".detail-form").trigger("submit");
    await flushPromises();
    expect(state.tasks[0].description).toBe("Offre machine");
    expect(store.editorDirty).toBe(false);
  });
  it("envoie un objet clonable lors du déplacement d’une tâche récurrente", async () => {
    const { store } = await boot("/kanban");
    await store.create("Contrôle chaque mois #client !1");
    await flushPromises();
    store.select(null);
    await store.change(store.snapshot.tasks[0], { status: "doing" });
    await flushPromises();
    expect(store.error).toBe("");
    expect(state.tasks[0].status).toBe("doing");
    expect(state.tasks[0].recurrence?.unit).toBe("month");
    expect(state.tasks[0].tagIds).toHaveLength(1);
  });
  it("rend les sept vues", async () => {
    const { store, router } = await boot();
    await store.create("Préparer intervention aujourd’hui");
    store.select(null);
    for (const view of [
      "today",
      "upcoming",
      "list",
      "kanban",
      "calendar",
      "matrix",
      "focus",
    ]) {
      await router.push("/" + view);
      await flushPromises();
      expect(wrapper.find("h1").exists()).toBe(true);
    }
    expect(wrapper.findAll(".focus-task")).toHaveLength(1);
  });
  it("supprime et restaure", async () => {
    const { store } = await boot("/list");
    await store.create("Contrôler");
    await flushPromises();
    await store.remove(state.tasks[0]);
    await flushPromises();
    expect(wrapper.findAll(".task-row")).toHaveLength(0);
    await store.undo();
    await flushPromises();
    expect(wrapper.findAll(".task-row")).toHaveLength(1);
  });
  it("applique thème et recherche", async () => {
    const { store } = await boot("/list");
    await store.create("Offre");
    await store.create("Commande");
    store.select(null);
    store.query = "commande";
    await store.preferences({ theme: "dark", launchAtLogin: false });
    await flushPromises();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(wrapper.findAll(".task-row")).toHaveLength(1);
    expect(state.tasks).toHaveLength(2);
  });
  it("protège le brouillon lors de fermeture refusée", async () => {
    const { store } = await boot("/list");
    await store.create("Offre");
    await flushPromises();
    await wrapper.find("#task-title").setValue("Brouillon");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    store.select(null);
    await flushPromises();
    expect(wrapper.find("#task-title").element).toHaveProperty(
      "value",
      "Brouillon",
    );
    expect(store.selectedId).not.toBeNull();
  });
  it("rend les composants du design system", async () => {
    await boot("/design");
    expect(wrapper.find(".design-system").text()).toContain(
      "Système de design",
    );
    expect(wrapper.findAll(".priority")).toHaveLength(4);
  });
  it("conserve brouillon pendant refresh et ajout enfant", async () => {
    const { store } = await boot("/list");
    await store.create("Parent");
    await flushPromises();
    await wrapper.find("#task-description").setValue("Brouillon à conserver");
    const id = store.selectedId!;
    await store.create("Enfant", id);
    await store.load();
    await flushPromises();
    expect(store.selectedId).toBe(id);
    expect(wrapper.find("#task-description").element).toHaveProperty(
      "value",
      "Brouillon à conserver",
    );
  });
  it("refuse la complétion si abandon refusé", async () => {
    const { store } = await boot("/list");
    await store.create("Parent");
    await flushPromises();
    await wrapper.find("#task-description").setValue("Brouillon");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await store.complete(store.selected!);
    await flushPromises();
    expect(state.tasks[0].status).toBe("todo");
    expect(wrapper.find("#task-description").element).toHaveProperty(
      "value",
      "Brouillon",
    );
  });
  it("protège puis efface le commentaire au changement de tâche", async () => {
    const { store } = await boot("/list");
    await store.create("A");
    await store.create("B");
    await flushPromises();
    await wrapper.find("#comment").setValue("Texte pour B");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    store.select(state.tasks[0].id);
    expect(store.selected?.title).toBe("B");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    store.select(state.tasks[0].id);
    await flushPromises();
    expect(wrapper.find("#comment").element).toHaveProperty("value", "");
  });
  it("actualise Aujourd’hui après minuit", async () => {
    const { store } = await boot("/today");
    await store.create("Demain demain");
    store.select(null);
    await flushPromises();
    expect(wrapper.findAll(".task-row")).toHaveLength(0);
    const future = new Date(store.now);
    future.setDate(future.getDate() + 1);
    store.now = future;
    await flushPromises();
    expect(wrapper.findAll(".task-row")).toHaveLength(1);
  });
  it("permet de démarrer un déplacement calendrier", async () => {
    const { store } = await boot("/calendar");
    await store.create("Planifier aujourd’hui");
    store.select(null);
    await flushPromises();
    expect(wrapper.find(".calendar-task").attributes("draggable")).toBe("true");
  });
  it("recliquer la sélection conserve la protection", async () => {
    const { store } = await boot("/list");
    await store.create("A");
    await flushPromises();
    await wrapper.find("#task-description").setValue("Brouillon");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    store.select(store.selectedId);
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.editorDirty).toBe(true);
  });
  it("abandonner puis terminer réinitialise vraiment le commentaire", async () => {
    const { store } = await boot("/list");
    await store.create("A");
    await flushPromises();
    await wrapper.find("#comment").setValue("À abandonner");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await store.complete(store.selected!);
    await flushPromises();
    expect(wrapper.find("#comment").element).toHaveProperty("value", "");
    expect(store.editorDirty).toBe(false);
    await wrapper.find("#comment").setValue("Nouveau texte");
    await flushPromises();
    expect(store.editorDirty).toBe(true);
  });
});
