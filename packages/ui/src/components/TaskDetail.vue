<script setup lang="ts">
import { ref, watch, computed, inject, onUnmounted } from "vue";
import {
  X,
  Plus,
  Trash2,
  Paperclip,
  MessageSquare,
  Check,
} from "lucide-vue-next";
import { useTasks, taskDto } from "../store";
import { hostKey } from "../context";
import {
  statusLabels,
  type Task,
  type TaskInput,
  type Comment,
  type Attachment,
  type Recurrence,
} from "@taskflow/core";
const props = defineProps<{ task: Task }>(),
  store = useTasks(),
  host = inject(hostKey, undefined),
  draft = ref<TaskInput>(taskDto(props.task)),
  subtask = ref(""),
  comment = ref(""),
  comments = ref<Comment[]>([]),
  attachments = ref<Attachment[]>([]),
  localReminder = ref(""),
  editRevision = ref(props.task.revision),
  original = ref(JSON.stringify(taskDto(props.task)));
const dirty = computed(
  () =>
    JSON.stringify(draft.value) !== original.value ||
    !!comment.value.trim() ||
    !!subtask.value.trim(),
);
watch(dirty, (v) => (store.editorDirty = v), { immediate: true });
onUnmounted(() => {
  store.editorDirty = false;
});
const children = computed(() =>
  store.snapshot.tasks.filter((t) => t.parentId === props.task.id),
);
function asLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
let generation = 0;
watch(
  [
    () => props.task.id,
    () => props.task.revision,
    () => store.resetDraftSignal,
  ],
  async ([id, _rev, signal], old) => {
    const changed = id !== old?.[0],
      reset = signal !== old?.[2];
    if (changed || reset || !store.editorDirty) {
      editRevision.value = props.task.revision;
      draft.value = JSON.parse(JSON.stringify(taskDto(props.task)));
      original.value = JSON.stringify(draft.value);
      localReminder.value = asLocal(props.task.reminderAt);
    }
    if (changed || reset) {
      comment.value = "";
      subtask.value = "";
      comments.value = [];
      attachments.value = [];
    }
    const gen = ++generation;
    try {
      const [c, a] = await Promise.all([
        store.data.comments(props.task.id),
        store.data.attachments(props.task.id),
      ]);
      if (gen === generation) {
        comments.value = c;
        attachments.value = a;
      }
    } catch (e) {
      store.error = e instanceof Error ? e.message : "Chargement impossible";
    }
  },
  { immediate: true },
);
async function saveDraft() {
  const t = await store.save(
    { ...props.task, revision: editRevision.value },
    draft.value,
  );
  if (t) {
    editRevision.value = t.revision;
    draft.value = JSON.parse(JSON.stringify(taskDto(t)));
    original.value = JSON.stringify(draft.value);
  }
}
function reminder(value: string) {
  localReminder.value = value;
  draft.value.reminderAt = value ? new Date(value).toISOString() : null;
}
function recurrence(value: string) {
  draft.value.recurrence = value
    ? { unit: value as Recurrence["unit"], interval: 1 }
    : null;
}
async function addChild() {
  if (await store.create(subtask.value, props.task.id)) subtask.value = "";
}
async function addComment() {
  await store.run(async () => {
    await store.data.addComment(props.task.id, comment.value);
    comments.value = await store.data.comments(props.task.id);
    comment.value = "";
  });
}
async function attach() {
  await store.run(async () => {
    await host?.captureAttachment(props.task.id);
    attachments.value = await store.data.attachments(props.task.id);
  });
}
</script>
<template>
  <aside class="detail" aria-label="Détails de la tâche">
    <div class="panel-heading">
      <strong>Détails de la tâche</strong
      ><button
        class="icon-button"
        aria-label="Fermer les détails"
        @click="store.select(null)"
      >
        <X />
      </button>
    </div>
    <form class="detail-form" @submit.prevent="saveDraft">
      <label for="task-title">Titre</label
      ><textarea
        id="task-title"
        v-model="draft.title"
        rows="2"
        required
        maxlength="500"
      /><label for="task-description">Description</label
      ><textarea
        id="task-description"
        v-model="draft.description"
        rows="3"
        placeholder="Contexte, références, prochaine action…"
      />
      <div class="field-grid">
        <label
          >Statut<select v-model="draft.status">
            <option
              v-for="(label, key) in statusLabels"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select></label
        ><label
          ><span id="task-priority-label">Priorité</span><select
            v-model.number="draft.priority"
            aria-labelledby="task-priority-label"
          >
            <option :value="1">P1 · Haute</option>
            <option :value="2">P2 · Moyenne</option>
            <option :value="3">P3 · Normale</option>
            <option :value="4">P4 · Basse</option>
          </select></label
        ><label
          >Échéance<input
            type="date"
            :value="draft.dueDate ?? ''"
            @input="
              draft.dueDate = ($event.target as HTMLInputElement).value || null
            " /></label
        ><label
          >Effort (minutes)<input
            v-model.number="draft.effort"
            type="number"
            min="0"
            max="100000"
        /></label>
      </div>
      <label
        >Rappel<input
          type="datetime-local"
          :value="localReminder"
          @input="reminder(($event.target as HTMLInputElement).value)"
      /></label>
      <div class="field-grid">
        <label class="check-label"
          ><input v-model="draft.urgent" type="checkbox" />Urgent</label
        ><label class="check-label"
          ><input v-model="draft.important" type="checkbox" />Important</label
        >
      </div>
      <label
        >Projet<select v-model="draft.projectId">
          <option :value="null">Sans projet</option>
          <option
            v-for="p in store.snapshot.projects"
            :key="p.id"
            :value="p.id"
          >
            {{ p.name }}
          </option>
        </select></label
      ><label
        >Tâche parente<select v-model="draft.parentId">
          <option :value="null">Aucune</option>
          <option
            v-for="t in store.snapshot.tasks.filter((t) => t.id !== task.id)"
            :key="t.id"
            :value="t.id"
          >
            {{ t.title }}
          </option>
        </select></label
      ><label
        >Récurrence<select
          :value="draft.recurrence?.unit ?? ''"
          @change="recurrence(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Aucune</option>
          <option value="day">Tous les jours</option>
          <option value="week">Toutes les semaines</option>
          <option value="month">Tous les mois</option>
          <option value="year">Tous les ans</option>
        </select></label
      ><label v-if="draft.recurrence"
        >Intervalle<input
          v-model.number="draft.recurrence.interval"
          type="number"
          min="1"
          max="365"
      /></label>
      <fieldset>
        <legend>Étiquettes</legend>
        <div class="tag-choices">
          <label
            v-for="tag in store.snapshot.tags"
            :key="tag.id"
            class="check-label"
            ><input v-model="draft.tagIds" type="checkbox" :value="tag.id" />{{
              tag.name
            }}</label
          ><span v-if="!store.snapshot.tags.length" class="muted"
            >Ajoutez une étiquette dans les réglages.</span
          >
        </div>
      </fieldset>
      <button class="primary" :disabled="store.busy || !dirty">
        {{ store.busy ? "Enregistrement…" : "Enregistrer les modifications" }}
      </button>
    </form>
    <section class="detail-section">
      <h3>
        Sous-tâches <span class="muted">{{ children.length }}</span>
      </h3>
      <div v-for="child in children" :key="child.id" class="child-row">
        <button
          class="task-check"
          :aria-label="'Terminer ' + child.title"
          @click="store.complete(child)"
        >
          <Check v-if="child.status === 'done'" /></button
        ><button class="text-button" @click="store.select(child.id)">
          {{ child.title }}
        </button>
      </div>
      <form class="inline" @submit.prevent="addChild">
        <input
          v-model="subtask"
          aria-label="Nouvelle sous-tâche"
          placeholder="Ajouter une sous-tâche"
        /><button
          class="icon-button"
          aria-label="Créer la sous-tâche"
          :disabled="!subtask.trim() || store.busy"
        >
          <Plus />
        </button>
      </form>
    </section>
    <section class="detail-section">
      <h3><Paperclip />Documents</h3>
      <button
        v-for="file in attachments"
        :key="file.id"
        class="attachment"
        @click="store.run(async () => host?.openAttachment(file.id))"
      >
        {{ file.name }}
        <span class="muted">{{ Math.ceil(file.size / 1024) }} Ko</span></button
      ><button v-if="host" :disabled="store.busy" @click="attach">
        Joindre un document
      </button>
    </section>
    <section class="detail-section">
      <h3><MessageSquare />Commentaires</h3>
      <article v-for="c in comments" :key="c.id" class="comment">
        <p>{{ c.body }}</p>
        <time class="muted">{{
          new Date(c.createdAt).toLocaleString("fr-FR")
        }}</time>
      </article>
      <form @submit.prevent="addComment">
        <label for="comment">Ajouter un commentaire</label
        ><textarea id="comment" v-model="comment" rows="2" /><button
          :disabled="!comment.trim() || store.busy"
        >
          Publier le commentaire
        </button>
      </form>
    </section>
    <div class="detail-section">
      <button class="danger" :disabled="store.busy" @click="store.remove(task)">
        <Trash2 />Supprimer la tâche
      </button>
      <p class="muted">Suppression réversible avec Ctrl+Z.</p>
    </div>
  </aside>
</template>
