<script setup lang="ts">
import { ref } from "vue";
const checked = ref(false);
</script>
<template>
  <section class="design-system">
    <h1>Système de design</h1>
    <p class="muted">TaskFlow · composants et états de référence</p>
    <h2>Typographie</h2>
    <h3>Préparer l’intervention</h3>
    <p>IBM Plex Sans · lecture et actions</p>
    <p class="mono">IBM Plex Mono · P1 · 18 sept. · Ctrl+K</p>
    <h2>Actions et champs</h2>
    <div class="inline">
      <button class="primary">Créer la tâche</button><button>Enregistrer</button
      ><button disabled>Enregistrement…</button
      ><button class="danger">Supprimer</button>
    </div>
    <label>Nom du projet<input value="Rétrofit FE141E" /></label
    ><label class="check-label"
      ><input v-model="checked" type="checkbox" />Intervention confirmée</label
    >
    <h2>Priorités</h2>
    <div class="inline">
      <span v-for="p in [1, 2, 3, 4]" :key="p" class="priority" :class="'p' + p"
        >P{{ p }}</span
      >
    </div>
    <h2>États</h2>
    <p role="status">Modifications enregistrées</p>
    <p class="error-text">La tâche a changé. Rechargez avant de réessayer.</p>
    <div class="empty-state">
      <h3>Aucune tâche prévue</h3>
      <p>Ajoutez votre prochaine action pour commencer.</p>
    </div>
    <div class="skeleton" aria-label="Chargement" />
  </section>
</template>
