<script setup lang="ts">
import { ref, inject } from "vue";
import Modal from "./Modal.vue";
import { useTasks } from "../store";
import { hostKey } from "../context";
const store = useTasks(),
  host = inject(hostKey, undefined),
  projectName = ref(""),
  tagName = ref(""),
  projectId = ref(""),
  tagId = ref("");
async function saveNamed(kind: "project" | "tag") {
  await store.run(async () => {
    if (kind === "project") {
      await store.data.saveProject({
        id: projectId.value || undefined,
        name: projectName.value,
      });
      projectName.value = "";
      projectId.value = "";
    } else {
      await store.data.saveTag({
        id: tagId.value || undefined,
        name: tagName.value,
      });
      tagName.value = "";
      tagId.value = "";
    }
    await store.load();
  });
}
</script>
<template>
  <Modal
    v-model:open="store.settingsOpen"
    title="Réglages"
    description="Personnalisez votre espace de travail."
    ><label
      >Apparence<select
        :value="store.snapshot.preferences.theme"
        @change="
          store.preferences({
            ...store.snapshot.preferences,
            theme: ($event.target as HTMLSelectElement).value as
              'light' | 'dark' | 'system',
          })
        "
      >
        <option value="system">Système</option>
        <option value="light">Clair</option>
        <option value="dark">Sombre</option>
      </select></label
    ><label v-if="host" class="check-label"
      ><input
        type="checkbox"
        :checked="store.snapshot.preferences.launchAtLogin"
        @change="
          store.preferences({
            ...store.snapshot.preferences,
            launchAtLogin: ($event.target as HTMLInputElement).checked,
          })
        "
      />Lancer à l’ouverture de session Windows</label
    >
    <h3>Projets</h3>
    <div class="name-list">
      <button
        v-for="p in store.snapshot.projects"
        :key="p.id"
        @click="
          projectId = p.id;
          projectName = p.name;
        "
      >
        {{ p.name }}
      </button>
    </div>
    <form class="inline" @submit.prevent="saveNamed('project')">
      <input
        v-model="projectName"
        aria-label="Nom du projet"
        placeholder="Nom du projet"
        maxlength="100"
      /><button :disabled="!projectName.trim() || store.busy">
        {{ projectId ? "Renommer le projet" : "Ajouter le projet" }}</button
      ><button
        v-if="projectId"
        type="button"
        @click="
          projectId = '';
          projectName = '';
        "
      >
        Annuler
      </button>
    </form>
    <h3>Étiquettes</h3>
    <div class="name-list">
      <button
        v-for="t in store.snapshot.tags"
        :key="t.id"
        @click="
          tagId = t.id;
          tagName = t.name;
        "
      >
        #{{ t.name }}
      </button>
    </div>
    <form class="inline" @submit.prevent="saveNamed('tag')">
      <input
        v-model="tagName"
        aria-label="Nom de l’étiquette"
        placeholder="Nom de l’étiquette"
        maxlength="100"
      /><button :disabled="!tagName.trim() || store.busy">
        {{ tagId ? "Renommer" : "Ajouter l’étiquette" }}</button
      ><button
        v-if="tagId"
        type="button"
        @click="
          tagId = '';
          tagName = '';
        "
      >
        Annuler
      </button>
    </form>
    <p v-if="store.error" class="error-text" role="alert">{{ store.error }}</p>
    <div class="form-actions">
      <button
        v-if="host"
        @click="
          store.run(async () => {
            store.notice = await host!.checkUpdates();
          })
        "
      >
        Vérifier les mises à jour
      </button>
    </div></Modal
  >
</template>
