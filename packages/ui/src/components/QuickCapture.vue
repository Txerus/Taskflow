<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Modal from "./Modal.vue";
import { parseQuickTask } from "@taskflow/core";
import { useTasks } from "../store";
const store = useTasks(),
  text = ref("");
watch(
  () => store.captureOpen,
  (v) => {
    if (v) text.value = "";
  },
);
const preview = computed(() => {
  try {
    return parseQuickTask(text.value);
  } catch {
    return null;
  }
});
</script>
<template>
  <Modal
    v-model:open="store.captureOpen"
    title="Nouvelle tâche"
    description="Écrivez naturellement. Vous pourrez préciser les détails ensuite."
    ><form @submit.prevent="store.create(text)">
      <label for="capture-title">Que faut-il faire ?</label
      ><input
        id="capture-title"
        v-model="text"
        autofocus
        autocomplete="off"
        placeholder="Relancer le client vendredi 10h #pro !haute"
        maxlength="700"
      />
      <div v-if="preview" class="capture-preview">
        <strong>{{ preview.input.title }}</strong>
        <div class="inline">
          <span class="priority" :class="'p' + preview.input.priority"
            >P{{ preview.input.priority }}</span
          ><span v-if="preview.input.dueDate">{{
            new Date(preview.input.dueDate + "T12:00:00").toLocaleDateString(
              "fr-FR",
            )
          }}</span
          ><span v-if="preview.input.reminderAt"
            >Rappel
            {{
              new Date(preview.input.reminderAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}</span
          ><span v-for="tag in preview.tagNames" :key="tag">#{{ tag }}</span>
        </div>
        <p v-for="warning in preview.warnings" :key="warning" class="warning">
          {{ warning }}
        </p>
      </div>
      <p v-if="store.error" role="alert" class="error-text">
        {{ store.error }}
      </p>
      <div class="form-actions">
        <button type="button" @click="store.captureOpen = false">Annuler</button
        ><button class="primary" :disabled="!preview || store.busy">
          {{ store.busy ? "Création…" : "Créer la tâche" }}
        </button>
      </div>
    </form></Modal
  >
</template>
