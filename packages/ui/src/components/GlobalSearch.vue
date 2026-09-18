<script setup lang="ts">
import { ref, watch, inject, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import type { SearchHit } from "@taskflow/core";
import { storeKey } from "../context";
import { useTasks } from "../store";
import Modal from "./Modal.vue";
const open = defineModel<boolean>("open", { required: true }),
  query = ref(""),
  hits = ref<SearchHit[]>([]),
  loading = ref(false),
  error = ref("");
const data = inject(storeKey)!,
  tasks = useTasks(),
  router = useRouter();
let timer: ReturnType<typeof setTimeout>,
  generation = 0;
watch([query, open], () => {
  clearTimeout(timer);
  const gen = ++generation;
  hits.value = [];
  error.value = "";
  loading.value = false;
  if (!open.value || !query.value.trim()) return;
  loading.value = true;
  timer = setTimeout(async () => {
    try {
      const result = await data.searchAll(query.value);
      if (gen === generation) hits.value = result;
    } catch (e) {
      if (gen === generation) error.value = String(e);
    } finally {
      if (gen === generation) loading.value = false;
    }
  }, 200);
});
onUnmounted(() => {
  clearTimeout(timer);
  generation++;
});
async function navigate(hit: SearchHit) {
  if (hit.kind === "page") {
    const target = "/notes/" + hit.id;
    if (router.currentRoute.value.path !== target) {
      const failure = await router.push(target);
      if (failure) return;
    }
  } else {
    if (router.currentRoute.value.path !== "/list") {
      const failure = await router.push("/list");
      if (failure) return;
    }
    await tasks.load();
    tasks.query = "";
    tasks.projectFilter = "";
    tasks.tagFilter = "";
    tasks.showDone = true;
    tasks.select(hit.id);
  }
  open.value = false;
}
</script>
<template>
  <Modal
    v-model:open="open"
    title="Recherche globale"
    description="Retrouvez vos pages et vos tâches."
  >
    <label for="global-query">Rechercher dans les pages et tâches</label>
    <input
      id="global-query"
      v-model="query"
      maxlength="200"
      autofocus
      placeholder="Un client, une réunion, une action…"
    />
    <p v-if="loading" role="status">Recherche…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <div v-else class="command-list">
      <button
        v-for="hit in hits"
        :key="hit.kind + hit.id"
        class="search-result"
        @click="navigate(hit)"
      >
        <span
          ><strong>{{ hit.title }}</strong
          ><small>{{ hit.excerpt }}</small></span
        ><span class="muted">{{ hit.kind === "page" ? "Page" : "Tâche" }}</span>
      </button>
      <p v-if="query.trim() && !hits.length" class="muted">
        Aucun résultat. Essayez un autre mot.
      </p>
    </div>
  </Modal>
</template>
