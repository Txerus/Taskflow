<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpDown,
  Target,
} from "lucide-vue-next";
import {
  localDay,
  addDays,
  statusLabels,
  priorityScore,
  type Task,
} from "@taskflow/core";
import { useTasks } from "../store";
import TaskRow from "../components/TaskRow.vue";
const route = useRoute(),
  store = useTasks(),
  month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  dragTarget = ref("");
const view = computed(() => String(route.params.view ?? "today")),
  today = computed(() => store.today);
const labels: Record<string, string> = {
  today: "Aujourd’hui",
  upcoming: "À venir",
  list: "Toutes les tâches",
  kanban: "Kanban",
  calendar: "Calendrier",
  matrix: "Matrice d’Eisenhower",
  focus: "Focus",
};
const visible = computed(() =>
  store.tasks.filter((t) =>
    view.value === "today"
      ? !!t.dueDate && t.dueDate <= today.value
      : view.value === "upcoming"
        ? !!t.dueDate && t.dueDate > today.value
        : true,
  ),
);
const grouped = computed(() => {
  const groups = new Map<string, Task[]>();
  for (const t of [...visible.value].sort((a, b) =>
    (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
  )) {
    const k = t.dueDate!;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups];
});
const days = computed(() => {
  const start = new Date(month.value),
    offset = (start.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) =>
    addDays(localDay(start), i - offset),
  );
});
const quadrants = [
  {
    label: "Faire maintenant",
    hint: "Urgent et important",
    urgent: true,
    important: true,
  },
  {
    label: "Planifier",
    hint: "Important, non urgent",
    urgent: false,
    important: true,
  },
  {
    label: "Déléguer",
    hint: "Urgent, non important",
    urgent: true,
    important: false,
  },
  {
    label: "Réévaluer",
    hint: "Ni urgent ni important",
    urgent: false,
    important: false,
  },
];
function drag(e: DragEvent, id: string) {
  e.dataTransfer?.setData("text/taskflow-id", id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function moveMonth(n: number) {
  month.value = new Date(
    month.value.getFullYear(),
    month.value.getMonth() + n,
    1,
  );
}
async function drop(e: DragEvent, patch: Partial<Task>) {
  dragTarget.value = "";
  const id = e.dataTransfer?.getData("text/taskflow-id"),
    task = store.snapshot.tasks.find((t) => t.id === id);
  if (task) await store.change(task, patch);
}
function fullDate(day: string) {
  return new Date(day + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
</script>
<template>
  <section class="workspace">
    <header class="view-header">
      <div>
        <h1>{{ labels[view] ?? "Toutes les tâches" }}</h1>
        <p class="muted">
          {{
            view === "today"
              ? fullDate(today)
              : view === "focus"
                ? "Trois priorités, une action à la fois."
                : view === "matrix"
                  ? "Classez vos tâches selon leur urgence et leur importance."
                  : `${visible.length} tâche${visible.length > 1 ? "s" : ""}`
          }}
        </p>
      </div>
      <button class="primary" @click="store.captureOpen = true">
        <Plus />Nouvelle tâche <kbd>N</kbd>
      </button>
    </header>
    <div class="toolbar">
      <label class="check-label"
        ><input v-model="store.showDone" type="checkbox" />Afficher les tâches
        terminées</label
      ><label class="filter-label"
        >Étiquette<select v-model="store.tagFilter">
          <option value="">Toutes</option>
          <option
            v-for="tag in store.snapshot.tags"
            :key="tag.id"
            :value="tag.id"
          >
            {{ tag.name }}
          </option>
        </select></label
      ><span class="sort-label"><ArrowUpDown />Priorité automatique</span>
    </div>
    <div
      v-if="store.loading"
      class="loading"
      role="status"
      aria-label="Chargement des tâches"
    >
      <div v-for="n in 5" :key="n" class="skeleton" />
    </div>
    <div v-else-if="!visible.length && view !== 'calendar'" class="empty-state">
      <Target />
      <h2>
        {{
          view === "today"
            ? "Rien à faire aujourd’hui"
            : "Aucune tâche dans cette vue"
        }}
      </h2>
      <p>
        {{
          store.query || store.projectFilter || store.tagFilter
            ? "Modifiez les filtres ou ajoutez une tâche."
            : "Ajoutez une prochaine action avec une échéance pour la retrouver ici."
        }}
      </p>
      <button @click="store.captureOpen = true">Créer une tâche</button>
    </div>
    <template v-else
      ><div v-if="view === 'kanban'" class="board">
        <section
          v-for="(label, status) in statusLabels"
          :key="status"
          class="board-column"
          :class="{ dragover: dragTarget === status }"
          @dragover.prevent="dragTarget = status"
          @dragleave="dragTarget = ''"
          @drop.prevent="drop($event, { status })"
        >
          <h2>
            {{ label }}
            <span>{{ visible.filter((t) => t.status === status).length }}</span>
          </h2>
          <TaskRow
            v-for="task in visible.filter((t) => t.status === status)"
            :key="task.id"
            :task="task"
            compact
          />
          <p v-if="!visible.some((t) => t.status === status)" class="drop-hint">
            Déposez une tâche ici
          </p>
        </section>
      </div>
      <div v-else-if="view === 'matrix'" class="matrix">
        <section
          v-for="q in quadrants"
          :key="q.label"
          class="quadrant"
          :class="{ dragover: dragTarget === q.label }"
          @dragover.prevent="dragTarget = q.label"
          @dragleave="dragTarget = ''"
          @drop.prevent="
            drop($event, { urgent: q.urgent, important: q.important })
          "
        >
          <h2>{{ q.label }}</h2>
          <p class="muted">{{ q.hint }}</p>
          <TaskRow
            v-for="task in visible.filter(
              (t) => t.urgent === q.urgent && t.important === q.important,
            )"
            :key="task.id"
            :task="task"
            compact
          />
          <p
            v-if="
              !visible.some(
                (t) => t.urgent === q.urgent && t.important === q.important,
              )
            "
            class="drop-hint"
          >
            Déposez une tâche ici
          </p>
        </section>
      </div>
      <div v-else-if="view === 'calendar'" class="calendar-wrap">
        <div class="calendar-heading">
          <h2>
            {{
              month.toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })
            }}
          </h2>
          <div class="inline">
            <button
              class="icon-button"
              aria-label="Mois précédent"
              @click="moveMonth(-1)"
            >
              <ChevronLeft /></button
            ><button
              @click="
                month = new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  1,
                )
              "
            >
              Ce mois-ci</button
            ><button
              class="icon-button"
              aria-label="Mois suivant"
              @click="moveMonth(1)"
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        <div class="calendar">
          <div
            v-for="day in [
              'Lun.',
              'Mar.',
              'Mer.',
              'Jeu.',
              'Ven.',
              'Sam.',
              'Dim.',
            ]"
            :key="day"
            class="weekday"
          >
            {{ day }}
          </div>
          <div
            v-for="day in days"
            :key="day"
            class="calendar-day"
            :data-day="day"
            :class="{
              today: day === today,
              outside: day.slice(0, 7) !== localDay(month).slice(0, 7),
              dragover: dragTarget === day,
            }"
            @dragover.prevent="dragTarget = day"
            @dragleave="dragTarget = ''"
            @drop.prevent="drop($event, { dueDate: day })"
          >
            <time :datetime="day">{{ Number(day.slice(-2)) }}</time
            ><button
              v-for="task in visible.filter((t) => t.dueDate === day)"
              :key="task.id"
              class="calendar-task"
              draggable="true"
              @dragstart="drag($event, task.id)"
              @click="store.select(task.id)"
            >
              <span class="priority" :class="'p' + task.priority"
                >P{{ task.priority }}</span
              >{{ task.title }}
            </button>
          </div>
        </div>
        <p class="muted">
          {{ visible.filter((t) => !t.dueDate).length }} tâche(s) sans échéance,
          visibles dans la Liste.
        </p>
      </div>
      <div v-else-if="view === 'upcoming'" class="task-list">
        <section v-for="[day, tasks] in grouped" :key="day">
          <h2 class="group-heading">{{ fullDate(day) }}</h2>
          <TaskRow v-for="task in tasks" :key="task.id" :task="task" />
        </section>
      </div>
      <div v-else-if="view === 'focus'" class="focus-view">
        <article
          v-for="(task, index) in visible
            .filter((t) => t.status !== 'done')
            .slice(0, 3)"
          :key="task.id"
          class="focus-task"
        >
          <div class="focus-number">{{ index + 1 }}</div>
          <div>
            <TaskRow :task="task" />
            <p class="muted">
              Score {{ priorityScore(task, store.now) }} ·
              {{
                task.effort
                  ? `${task.effort} min estimées`
                  : "Effort non précisé"
              }}
            </p>
            <p v-if="task.description">{{ task.description }}</p>
          </div>
        </article>
      </div>
      <div v-else class="task-list">
        <TaskRow v-for="task in visible" :key="task.id" :task="task" /></div
    ></template>
  </section>
</template>
