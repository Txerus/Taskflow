<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref, computed, inject } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  Check,
  Sun,
  CalendarRange,
  List,
  Columns3,
  CalendarDays,
  Grid2X2,
  Target,
  Plus,
  Search,
  Settings as SettingsIcon,
  Folder,
  Command,
  Minus,
  Square,
  X,
  BookOpen,
} from "lucide-vue-next";
import { useTasks } from "./store";
import { hostKey } from "./context";
import QuickCapture from "./components/QuickCapture.vue";
import TaskDetail from "./components/TaskDetail.vue";
import Settings from "./components/Settings.vue";
import Modal from "./components/Modal.vue";
import GlobalSearch from "./components/GlobalSearch.vue";
const globalSearch = ref(false);
const store = useTasks(),
  host = inject(hostKey, undefined),
  router = useRouter(),
  route = useRoute(),
  search = ref<HTMLInputElement | null>(null),
  commandQuery = ref("");
const navigation = [
  { id: "today", label: "Aujourd’hui", icon: Sun },
  { id: "upcoming", label: "À venir", icon: CalendarRange },
  { id: "list", label: "Liste", icon: List },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "calendar", label: "Calendrier", icon: CalendarDays },
  { id: "matrix", label: "Matrice", icon: Grid2X2 },
  { id: "focus", label: "Focus", icon: Target },
  { id: "notes", label: "Carnets", icon: BookOpen },
];
const commands = computed(() =>
  [
    {
      label: "Créer une tâche",
      key: "N",
      run: () => {
        store.captureOpen = true;
      },
    },
    ...navigation.map((n) => ({
      label: `Ouvrir ${n.label}`,
      key: "",
      run: () => router.push("/" + n.id),
    })),
    {
      label: "Rechercher les tâches",
      key: "/",
      run: () => search.value?.focus(),
    },
    {
      label: "Réglages, projets et étiquettes",
      key: "",
      run: () => {
        store.settingsOpen = true;
      },
    },
    { label: "Annuler la suppression", key: "Ctrl+Z", run: () => store.undo() },
    { label: "Système de design", key: "", run: () => router.push("/design") },
    {
      label: "Recherche globale",
      key: "Ctrl+Maj+F",
      run: () => {
        globalSearch.value = true;
      },
    },
  ].filter((c) =>
    c.label
      .toLocaleLowerCase("fr")
      .includes(commandQuery.value.toLocaleLowerCase("fr")),
  ),
);
const removeGuard = router.beforeEach((to) => {
  if (
    (to.path === "/design" || to.path.startsWith("/notes")) &&
    store.editorDirty &&
    !store.discardDraft()
  )
    return false;
  return true;
});
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  document.documentElement.dataset.theme =
    store.snapshot.preferences.theme === "system"
      ? systemTheme.matches
        ? "dark"
        : "light"
      : store.snapshot.preferences.theme;
}
watch(() => store.snapshot.preferences.theme, applyTheme, { immediate: true });
function keyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const editing = !!target.closest(
    "input,textarea,select,[contenteditable=true]",
  );
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === "f"
  ) {
    event.preventDefault();
    globalSearch.value = true;
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    store.paletteOpen = !store.paletteOpen;
    commandQuery.value = "";
    return;
  }
  if (
    editing ||
    globalSearch.value ||
    store.captureOpen ||
    store.paletteOpen ||
    store.settingsOpen
  )
    return;
  if ((event.ctrlKey || event.metaKey) && event.key === "z") {
    event.preventDefault();
    void store.undo();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    store.captureOpen = true;
  } else if (event.key === "/") {
    event.preventDefault();
    search.value?.focus();
  } else if (event.key.toLowerCase() === "e" && store.selected) {
    event.preventDefault();
    void store.complete(store.selected);
  }
}
let clock: ReturnType<typeof setInterval>;
let unsubscribe: (() => void)[] = [];
onMounted(() => {
  void store.load();
  clock = setInterval(store.refreshClock, 30000);
  window.addEventListener("focus", store.refreshClock);
  document.addEventListener("keydown", keyboard);
  systemTheme.addEventListener("change", applyTheme);
  if (host)
    unsubscribe = [
      host.onCapture(() => {
        store.captureOpen = true;
      }),
      host.onTaskChanged(() => {
        void store.load();
      }),
    ];
});
onUnmounted(() => {
  removeGuard();
  clearInterval(clock);
  window.removeEventListener("focus", store.refreshClock);
  document.removeEventListener("keydown", keyboard);
  systemTheme.removeEventListener("change", applyTheme);
  unsubscribe.forEach((fn) => fn());
});
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Aller aux tâches</a>
    <header class="titlebar">
      <div class="brand"><Check /><strong>TaskFlow</strong></div>
      <span class="titlebar-label">Mon espace de travail</span>
      <div v-if="host" class="window-controls">
        <button
          aria-label="Réduire la fenêtre"
          @click="host.windowAction('minimize')"
        >
          <Minus /></button
        ><button
          aria-label="Agrandir la fenêtre"
          @click="host.windowAction('maximize')"
        >
          <Square /></button
        ><button
          aria-label="Fermer la fenêtre"
          @click="host.windowAction('close')"
        >
          <X />
        </button>
      </div>
    </header>
    <div class="app-body">
      <aside class="sidebar">
        <button class="capture-button" @click="store.captureOpen = true">
          <Plus />Nouvelle tâche<kbd>N</kbd></button
        ><button class="command-button" @click="store.paletteOpen = true">
          <Command />Commandes<kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="Vues des tâches">
          <RouterLink
            v-for="item in navigation"
            :key="item.id"
            :to="'/' + item.id"
            ><component :is="item.icon" />{{ item.label
            }}<span v-if="item.id === 'today'" class="nav-count">{{
              store.snapshot.tasks.filter(
                (t) =>
                  t.status !== "done" && t.dueDate && t.dueDate <= store.today,
              ).length
            }}</span></RouterLink
          >
        </nav>
        <div class="sidebar-heading">
          <h2>Projets</h2>
          <button
            class="icon-button"
            aria-label="Gérer les projets"
            @click="store.settingsOpen = true"
          >
            <Plus />
          </button>
        </div>
        <button
          class="project-filter"
          :class="{ active: !store.projectFilter }"
          @click="store.projectFilter = ''"
        >
          Tous les projets</button
        ><button
          v-for="p in store.snapshot.projects"
          :key="p.id"
          class="project-filter"
          :class="{ active: store.projectFilter === p.id }"
          @click="
            store.projectFilter = p.id;
            router.push('/list');
          "
        >
          <Folder />{{ p.name }}
        </button>
        <p v-if="!store.snapshot.projects.length" class="sidebar-hint">
          Regroupez vos tâches par client ou par projet.
        </p>
        <div class="sidebar-bottom">
          <button @click="store.settingsOpen = true">
            <SettingsIcon />Réglages</button
          ><span class="muted">Enregistré sur cet ordinateur</span>
        </div>
      </aside>
      <main id="main-content" class="main" tabindex="-1">
        <div class="searchbar">
          <button aria-label="Recherche globale" @click="globalSearch = true">
            <Search aria-hidden="true" />Tout rechercher
          </button>
          <Search /><input
            ref="search"
            v-model="store.query"
            aria-label="Rechercher les tâches"
            placeholder="Rechercher dans les tâches…"
          /><kbd>/</kbd
          ><button
            v-if="store.query"
            class="icon-button"
            aria-label="Effacer la recherche"
            @click="store.query = ''"
          >
            <X />
          </button>
        </div>
        <div
          v-if="store.error && !store.captureOpen && !store.settingsOpen"
          role="alert"
          class="error-banner"
        >
          {{ store.error }}<button @click="store.load()">Recharger</button
          ><button
            class="icon-button"
            aria-label="Masquer l’erreur"
            @click="store.error = ''"
          >
            <X />
          </button>
        </div>
        <RouterView />
      </main>
      <TaskDetail
        v-if="
          store.selected &&
          route.path !== '/design' &&
          !route.path.startsWith('/notes')
        "
        :task="store.selected"
      />
    </div>
    <div v-if="store.notice" class="toast" role="status">
      <Check />{{ store.notice
      }}<button v-if="store.undoToken" @click="store.undo()">Annuler</button
      ><button
        class="icon-button"
        aria-label="Fermer le message"
        @click="store.notice = ''"
      >
        <X />
      </button>
    </div>
    <GlobalSearch
      v-model:open="globalSearch"
    /><QuickCapture /><Settings /><Modal
      v-model:open="store.paletteOpen"
      title="Commandes"
      description="Recherchez une action ou une vue."
      ><input
        v-model="commandQuery"
        aria-label="Rechercher une commande"
        autofocus
        placeholder="Créer, ouvrir, régler…"
      />
      <div class="command-list">
        <button
          v-for="cmd in commands"
          :key="cmd.label"
          @click="
            store.paletteOpen = false;
            cmd.run();
          "
        >
          {{ cmd.label }}<kbd v-if="cmd.key">{{ cmd.key }}</kbd>
        </button>
        <p v-if="!commands.length" class="muted">
          Aucune commande correspondante.
        </p>
      </div></Modal
    >
  </div>
</template>
