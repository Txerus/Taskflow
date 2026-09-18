<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, onBeforeUnmount } from "vue";
import {
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from "vue-router";
import { BookOpen, Plus, FileText, Trash2 } from "lucide-vue-next";
import {
  emptyDocument,
  walkNotes,
  plainText,
  type NotesSnapshot,
  type NotePage,
  type NoteKind,
  type RichNode,
} from "@taskflow/core";
import { storeKey } from "../context";
import { useTasks } from "../store";
import NoteEditor from "../components/NoteEditor.vue";
import Modal from "../components/Modal.vue";
const data = inject(storeKey)!,
  tasks = useTasks(),
  route = useRoute(),
  router = useRouter();
const notes = ref<NotesSnapshot>({ notebooks: [], sections: [], pages: [] }),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  status = ref("");
const notebookId = ref(""),
  sectionId = ref(""),
  page = ref<NotePage | null>(null),
  title = ref(""),
  content = ref<RichNode>(emptyDocument()),
  dirty = ref(false),
  undoToken = ref("");
const editor = ref<InstanceType<typeof NoteEditor> | null>(null);
const sections = computed(() =>
  notes.value.sections.filter((s) => s.notebookId === notebookId.value),
);
const pages = computed(() =>
  notes.value.pages.filter((p) => p.sectionId === sectionId.value),
);
const checklist = computed(() => {
  const items: RichNode[] = [];
  walkNotes(content.value, (n) => {
    if (n.type === "taskItem") items.push(n);
  });
  return items;
});
const refs = computed(() => {
  const out: {
    kind: "page" | "task";
    id: string;
    label: string;
    exists: boolean;
  }[] = [];
  walkNotes(content.value, (n) => {
    if (n.type !== "reference") return;
    const a = n.attrs!;
    const item =
      a.kind === "page"
        ? notes.value.pages.find((p) => p.id === a.targetId)
        : tasks.snapshot.tasks.find((t) => t.id === a.targetId);
    out.push({
      kind: a.kind,
      id: a.targetId,
      label: item?.title ?? a.label,
      exists: !!item,
    });
  });
  return out;
});
function failure(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e);
}
async function run(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    failure(e);
  } finally {
    busy.value = false;
  }
}
async function load() {
  notes.value = await data.notesSnapshot();
  if (!notes.value.notebooks.some((n) => n.id === notebookId.value))
    notebookId.value = notes.value.notebooks[0]?.id ?? "";
  if (!sections.value.some((s) => s.id === sectionId.value))
    sectionId.value = sections.value[0]?.id ?? "";
}
function accept(p: NotePage | null) {
  page.value = p ? JSON.parse(JSON.stringify(p)) : null;
  title.value = p?.title ?? "";
  content.value = p ? JSON.parse(JSON.stringify(p.content)) : emptyDocument();
  editor.value?.replace(content.value);
  dirty.value = false;
  status.value = p ? "Enregistré" : "";
  if (p) {
    sectionId.value = p.sectionId;
    notebookId.value =
      notes.value.sections.find((s) => s.id === p.sectionId)?.notebookId ?? "";
  }
}
function discard() {
  if (busy.value) return false;
  if (
    dirty.value &&
    !window.confirm("Abandonner les modifications de cette page ?")
  )
    return false;
  dirty.value = false;
  return true;
}
async function openPage(id: string) {
  if (page.value?.id === id) return;
  if (!discard()) return;
  await router.push("/notes/" + id);
  if (route.params.pageId === id)
    accept(notes.value.pages.find((p) => p.id === id) ?? null);
}
async function syncRoute() {
  const id = String(route.params.pageId ?? "");
  const found = notes.value.pages.find((p) => p.id === id) ?? null;
  accept(found);
  if (id && !found)
    error.value = "Page introuvable ou supprimée. Choisissez une autre page.";
}
watch(
  () => route.params.pageId,
  () => {
    if (!loading.value) void syncRoute();
  },
);
onBeforeRouteLeave(() => !dirty.value || discard());
onBeforeRouteUpdate(
  (to, from) =>
    to.params.pageId === from.params.pageId || !dirty.value || discard(),
);
function changed(doc: RichNode) {
  content.value = doc;
  dirty.value = true;
  status.value = "Modifications non enregistrées";
}
async function persist() {
  if (!page.value) return;
  const saved = await data.savePage({
    id: page.value.id,
    revision: page.value.revision,
    sectionId: page.value.sectionId,
    title: title.value,
    content: JSON.parse(JSON.stringify(content.value)),
  });
  await load();
  await tasks.load();
  accept(saved);
  return saved;
}
async function save() {
  await run(async () => {
    await persist();
  });
}
async function reload() {
  if (!discard()) return;
  await run(async () => {
    await load();
    await tasks.load();
    await syncRoute();
  });
}
function keyboard(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void save();
  }
}
function unload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onMounted(async () => {
  document.addEventListener("keydown", keyboard);
  window.addEventListener("beforeunload", unload);
  try {
    await load();
    await syncRoute();
  } catch (e) {
    failure(e);
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", keyboard);
  window.removeEventListener("beforeunload", unload);
});
const manager = ref(false),
  kind = ref<NoteKind>("notebook"),
  editingId = ref(""),
  name = ref(""),
  parentId = ref("");
function manage(k: NoteKind, id = "") {
  kind.value = k;
  editingId.value = id;
  const item =
    k === "notebook"
      ? notes.value.notebooks.find((n) => n.id === id)
      : k === "section"
        ? notes.value.sections.find((s) => s.id === id)
        : notes.value.pages.find((p) => p.id === id);
  name.value = item ? ("name" in item ? item.name : item.title) : "";
  parentId.value =
    k === "section"
      ? item && "notebookId" in item
        ? String(item.notebookId)
        : notebookId.value
      : sectionId.value;
  manager.value = true;
}
async function submitManager() {
  await run(async () => {
    if (!discardWhileManaging()) return;
    let newPage: NotePage | undefined;
    if (kind.value === "notebook") {
      const old = notes.value.notebooks.find((n) => n.id === editingId.value);
      const n = await data.saveNotebook({
        id: old?.id,
        revision: old?.revision,
        name: name.value,
      });
      notebookId.value = n.id;
    } else if (kind.value === "section") {
      const old = notes.value.sections.find((n) => n.id === editingId.value);
      const s = await data.saveSection({
        id: old?.id,
        revision: old?.revision,
        notebookId: parentId.value,
        name: name.value,
      });
      sectionId.value = s.id;
      notebookId.value = s.notebookId;
    } else {
      const old = notes.value.pages.find((n) => n.id === editingId.value);
      newPage = await data.savePage({
        id: old?.id,
        revision: old?.revision,
        sectionId: parentId.value,
        title: name.value,
        content: old?.content ?? emptyDocument(),
      });
    }
    await load();
    manager.value = false;
    if (newPage) {
      accept(newPage);
      await router.push("/notes/" + newPage.id);
    } else {
      accept(null);
      await router.push("/notes");
    }
  });
}
function discardWhileManaging() {
  if (
    dirty.value &&
    !window.confirm("Abandonner les modifications de cette page ?")
  )
    return false;
  dirty.value = false;
  return true;
}
async function remove(k: NoteKind, id: string) {
  if (
    !window.confirm(
      "Supprimer cet élément et son contenu ? Vous pourrez annuler la suppression. Les tâches liées seront conservées.",
    )
  )
    return;
  if (!discard()) return;
  await run(async () => {
    const item =
      k === "notebook"
        ? notes.value.notebooks.find((n) => n.id === id)
        : k === "section"
          ? notes.value.sections.find((n) => n.id === id)
          : notes.value.pages.find((n) => n.id === id);
    if (!item) return;
    undoToken.value = await data.deleteNote(k, id, item.revision);
    accept(null);
    await load();
    await router.push("/notes");
    status.value = "Suppression effectuée";
  });
}
async function undo() {
  await run(async () => {
    await data.restoreNote(undoToken.value);
    undoToken.value = "";
    await load();
    status.value = "Suppression annulée";
  });
}
function selectNotebook(id: string) {
  if (notebookId.value === id) return;
  if (!discard()) return;
  notebookId.value = id;
  sectionId.value = sections.value[0]?.id ?? "";
  accept(null);
  void router.push("/notes");
}
function selectSection(id: string) {
  if (sectionId.value === id) return;
  if (!discard()) return;
  sectionId.value = id;
  accept(null);
  void router.push("/notes");
}
async function linkItem(index: number, taskId: string | null = null) {
  await run(async () => {
    const saved = await persist();
    if (!saved) return;
    const items: RichNode[] = [];
    walkNotes(saved.content, (n) => {
      if (n.type === "taskItem") items.push(n);
    });
    const linked = await data.linkChecklist(
      saved.id,
      saved.revision,
      items[index].attrs!.itemId,
      taskId,
    );
    await load();
    await tasks.load();
    accept(linked);
  });
}
const picker = ref(false),
  pickKind = ref<"page" | "task">("page"),
  pickQuery = ref(""),
  pickMode = ref<"reference" | "checklist">("reference");
const choices = computed(() =>
  (pickKind.value === "page" ? notes.value.pages : tasks.snapshot.tasks)
    .filter((p) =>
      p.title
        .toLocaleLowerCase("fr")
        .includes(pickQuery.value.toLocaleLowerCase("fr")),
    )
    .slice(0, 40),
);
function reference(k: "page" | "task", q: string) {
  pickMode.value = "reference";
  pickKind.value = k;
  pickQuery.value = q;
  picker.value = true;
}
function chooseTask() {
  pickMode.value = "checklist";
  pickKind.value = "task";
  pickQuery.value = "";
  picker.value = true;
}
async function choose(id: string, label: string) {
  picker.value = false;
  if (pickMode.value === "reference") {
    editor.value?.insertReference(pickKind.value, id, label);
    return;
  }
  const itemId = crypto.randomUUID();
  editor.value?.addTaskItem(itemId, label);
  await run(async () => {
    const saved = await persist();
    if (!saved) return;
    const linked = await data.linkChecklist(
      saved.id,
      saved.revision,
      itemId,
      id,
    );
    await load();
    accept(linked);
  });
}
async function navigate(k: "page" | "task", id: string) {
  if (k === "page") {
    if (!notes.value.pages.some((p) => p.id === id)) {
      error.value = "Cette page a été supprimée.";
      return;
    }
    await openPage(id);
  } else {
    await tasks.load();
    if (!tasks.snapshot.tasks.some((t) => t.id === id)) {
      error.value = "Cette tâche a été supprimée.";
      return;
    }
    if (!discard()) return;
    const fail = await router.push("/list");
    if (!fail) {
      tasks.query = "";
      tasks.projectFilter = "";
      tasks.tagFilter = "";
      tasks.showDone = true;
      tasks.select(id);
    }
  }
}
</script>
<template>
  <section class="notes-workspace">
    <header class="view-header">
      <div>
        <h1>Carnets</h1>
        <p class="muted">Notes de réunion, références et prochaines actions.</p>
      </div>
      <button :disabled="busy" @click="manage('notebook')">
        <Plus aria-hidden="true" />Nouveau carnet
      </button>
    </header>
    <div v-if="error" role="alert" class="error-banner">
      {{ error }}<button :disabled="busy" @click="reload">Recharger</button>
    </div>
    <div v-if="loading" role="status" class="loading">
      Chargement des carnets…
    </div>
    <div v-else class="notes-layout">
      <aside class="notes-browser" aria-label="Carnets et sections">
        <div v-if="!notes.notebooks.length" class="notes-empty">
          <BookOpen aria-hidden="true" />
          <p>Créez un carnet pour regrouper vos notes.</p>
        </div>
        <div v-for="n in notes.notebooks" :key="n.id" class="notebook-group">
          <button
            class="notebook-title"
            :aria-pressed="notebookId === n.id"
            @click="selectNotebook(n.id)"
          >
            <BookOpen aria-hidden="true" />{{ n.name }}
          </button>
          <template v-if="notebookId === n.id">
            <div class="note-tools">
              <button @click="manage('notebook', n.id)">Renommer</button
              ><button
                :aria-label="'Supprimer le carnet ' + n.name"
                @click="remove('notebook', n.id)"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            <button
              v-for="s in sections"
              :key="s.id"
              class="section-choice"
              :aria-pressed="sectionId === s.id"
              @click="selectSection(s.id)"
            >
              {{ s.name }}
            </button>
            <button class="text-button" @click="manage('section')">
              <Plus aria-hidden="true" />Nouvelle section
            </button>
          </template>
        </div>
      </aside>
      <aside class="notes-pages" aria-label="Pages de la section">
        <template v-if="sectionId"
          ><div class="notes-list-heading">
            <h2>{{ sections.find((s) => s.id === sectionId)?.name }}</h2>
            <button aria-label="Créer une page" @click="manage('page')">
              <Plus aria-hidden="true" />
            </button>
          </div>
          <div class="note-tools">
            <button @click="manage('section', sectionId)">
              Modifier la section</button
            ><button
              aria-label="Supprimer la section"
              @click="remove('section', sectionId)"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
          <button
            v-for="p in pages"
            :key="p.id"
            class="page-choice"
            :aria-pressed="page?.id === p.id"
            @click="openPage(p.id)"
          >
            <FileText aria-hidden="true" /><span
              >{{ p.title
              }}<small>{{
                new Date(p.updatedAt).toLocaleDateString("fr-FR")
              }}</small></span
            >
          </button>
          <p v-if="!pages.length" class="notes-empty">
            Aucune page. Utilisez + pour commencer.
          </p>
        </template>
        <p v-else class="notes-empty">Choisissez ou créez une section.</p>
      </aside>
      <article class="note-sheet">
        <template v-if="page">
          <div class="note-sheet-header">
            <label for="note-title">Titre de la page</label
            ><input
              id="note-title"
              v-model="title"
              maxlength="200"
              :disabled="busy"
              @input="
                dirty = true;
                status = 'Modifications non enregistrées';
              "
            />
            <div class="note-actions">
              <span role="status" class="muted">{{
                busy ? "Enregistrement…" : status
              }}</span
              ><button class="primary" :disabled="busy || !dirty" @click="save">
                Enregistrer la page</button
              ><button :disabled="busy" @click="manage('page', page.id)">
                Déplacer / renommer</button
              ><button
                :disabled="busy"
                aria-label="Supprimer la page"
                @click="remove('page', page.id)"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </div>
          <NoteEditor
            :key="page.id"
            ref="editor"
            :content="content"
            :disabled="busy"
            @change="changed"
            @reference="reference"
            @navigate="navigate"
            @error="error = $event"
          />
          <section class="note-links">
            <h2>Actions de cette page</h2>
            <p class="muted">
              Enregistrez une checklist, puis transformez ses éléments en
              tâches. Les états restent synchronisés.
            </p>
            <button :disabled="busy" @click="chooseTask">
              Ajouter une tâche existante à la checklist
            </button>
            <div
              v-for="(item, i) in checklist"
              :key="item.attrs?.itemId ?? i"
              class="checklist-link"
            >
              <span>{{ plainText(item) }}</span
              ><button
                v-if="!item.attrs?.taskId"
                :disabled="busy"
                @click="linkItem(i)"
              >
                Transformer en tâche</button
              ><button
                v-else
                :disabled="busy"
                @click="navigate('task', item.attrs.taskId)"
              >
                Ouvrir la tâche
              </button>
            </div>
            <h2 v-if="refs.length">Références</h2>
            <div class="inline">
              <button
                v-for="(r, i) in refs"
                :key="i"
                :disabled="!r.exists"
                @click="navigate(r.kind, r.id)"
              >
                {{ r.label }}{{ r.exists ? "" : " (supprimé)" }}
              </button>
            </div>
          </section>
        </template>
        <div v-else class="empty-state">
          <FileText aria-hidden="true" />
          <h2>Une page pour garder le contexte</h2>
          <p>
            Choisissez une page ou créez-en une dans la section sélectionnée.
          </p>
          <button v-if="sectionId" @click="manage('page')">
            Nouvelle page
          </button>
        </div>
      </article>
    </div>
    <div v-if="undoToken" class="notes-undo" role="status">
      Élément supprimé.<button :disabled="busy" @click="undo">
        Annuler la suppression de note
      </button>
    </div>
    <Modal
      v-model:open="manager"
      :title="editingId ? 'Modifier cet élément' : 'Créer un élément'"
      description="Organisez vos notes par carnet et section."
      ><form @submit.prevent="submitManager">
        <label for="note-name">Nom</label
        ><input
          id="note-name"
          v-model.trim="name"
          required
          maxlength="200"
          autofocus
        />
        <template v-if="kind !== 'notebook'"
          ><label for="note-parent">{{
            kind === "section"
              ? "Carnet de destination"
              : "Section de destination"
          }}</label
          ><select id="note-parent" v-model="parentId" required>
            <option
              v-for="p in kind === 'section' ? notes.notebooks : notes.sections"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </select></template
        >
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="form-actions">
          <button type="button" @click="manager = false">Annuler</button
          ><button class="primary" :disabled="busy || !name">
            {{ editingId ? "Enregistrer cet élément" : "Créer cet élément" }}
          </button>
        </div>
      </form></Modal
    >
    <Modal
      v-model:open="picker"
      :title="pickKind === 'page' ? 'Lier une page' : 'Lier une tâche'"
      description="Choisissez un élément existant. Le lien conserve son identifiant."
      ><label for="note-reference-query">Rechercher une référence</label
      ><input id="note-reference-query" v-model="pickQuery" autofocus />
      <div class="command-list">
        <button v-for="c in choices" :key="c.id" @click="choose(c.id, c.title)">
          {{ c.title }}
        </button>
        <p v-if="!choices.length" class="muted">Aucun élément correspondant.</p>
      </div></Modal
    >
  </section>
</template>
