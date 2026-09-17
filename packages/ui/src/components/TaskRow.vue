<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, CornerDownRight, Repeat2, Check } from "lucide-vue-next";
import { useTasks } from "../store";
import type { Task } from "@taskflow/core";
const props = defineProps<{ task: Task; compact?: boolean }>();
const store = useTasks();
const project = computed(
  () =>
    store.snapshot.projects.find((p) => p.id === props.task.projectId)?.name,
);
const children = computed(() =>
  store.snapshot.tasks.filter((t) => t.parentId === props.task.id),
);
function drag(e: DragEvent) {
  e.dataTransfer?.setData("text/taskflow-id", props.task.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
</script>
<template>
  <div
    class="task-row"
    :class="{
      selected: store.selectedId === task.id,
      done: task.status === 'done',
      compact,
    }"
    :data-task-id="task.id"
    draggable="true"
    @dragstart="drag"
  >
    <button
      class="task-check"
      :class="{ checked: task.status === 'done' }"
      :aria-label="
        (task.status === 'done' ? 'Rouvrir ' : 'Terminer ') + task.title
      "
      :disabled="store.busy"
      @click="store.complete(task)"
    >
      <Check v-if="task.status === 'done'" aria-hidden="true" /></button
    ><button class="task-open" @click="store.select(task.id)">
      <span class="task-title"
        ><CornerDownRight
          v-if="task.parentId"
          class="muted"
          aria-hidden="true"
        />{{ task.title }}</span
      ><span class="task-meta"
        ><span v-if="project">{{ project }}</span
        ><span v-if="children.length"
          >{{ children.filter((t) => t.status === "done").length }}/{{
            children.length
          }}
          sous-tâches</span
        ><span
          v-for="tag in store.snapshot.tags.filter((t) =>
            task.tagIds.includes(t.id),
          )"
          :key="tag.id"
          >#{{ tag.name }}</span
        ></span
      ></button
    ><span
      v-if="task.dueDate"
      class="due"
      :class="{ overdue: task.dueDate < store.today && task.status !== 'done' }"
      ><CalendarDays aria-hidden="true" />{{
        new Date(task.dueDate + "T12:00:00").toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        })
      }}</span
    ><Repeat2
      v-if="task.recurrence"
      class="muted"
      aria-label="Récurrente"
    /><span class="priority" :class="'p' + task.priority"
      >P{{ task.priority }}</span
    >
  </div>
</template>
