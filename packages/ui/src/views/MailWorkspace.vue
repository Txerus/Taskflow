<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { Mail, RefreshCw, Link2, Clock3, Paperclip } from "lucide-vue-next";
import { taskInputSchema, type MailSnapshot } from "@taskflow/core";
import { hostKey, storeKey } from "../context";
import { useTasks } from "../store";

const data = inject(storeKey)!;
const host = inject(hostKey, undefined);
const tasks = useTasks();
const snapshot = ref<MailSnapshot>({ accounts: [], messages: [], waiting: [] });
const selectedId = ref("");
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const auth = ref({
  googleConfigured: false,
  microsoftConfigured: false,
  encryptionAvailable: true,
});
const dueDate = ref("");
const replyBody = ref("");

const selected = computed(
  () => snapshot.value.messages.find((m) => m.id === selectedId.value) ?? null,
);
const selectedAccount = computed(() =>
  selected.value
    ? snapshot.value.accounts.find((a) => a.id === selected.value!.accountId)
    : null,
);
const waiting = computed(() =>
  selected.value
    ? snapshot.value.waiting.find((w) => w.messageId === selected.value!.id)
    : null,
);

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
async function run(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = message(e);
  } finally {
    busy.value = false;
  }
}
async function load() {
  snapshot.value = await data.mailSnapshot();
  if (
    selectedId.value &&
    !snapshot.value.messages.some((m) => m.id === selectedId.value)
  )
    selectedId.value = "";
}
async function connect(provider: "google" | "microsoft") {
  if (!host) return;
  await run(async () => {
    const account = await host.connectMail(provider);
    await host.syncMail(account.id);
    await load();
  });
}
async function disconnect(accountId: string) {
  if (!host || !window.confirm("Déconnecter ce compte et supprimer son cache mail local ?"))
    return;
  await run(async () => {
    await host.disconnectMail(accountId);
    selectedId.value = "";
    await load();
  });
}
async function syncAccount(accountId: string) {
  if (!host) return;
  await run(async () => {
    const count = await host.syncMail(accountId);
    await load();
    tasks.notice = `${count} e-mail(s) synchronisé(s)`;
  });
}
async function sendReply() {
  if (!host || !selected.value || !replyBody.value.trim()) return;
  await run(async () => {
    await host.replyMail(selected.value!.id, replyBody.value);
    replyBody.value = "";
    tasks.notice = "Réponse envoyée";
    await host.syncMail(selected.value!.accountId);
    await load();
  });
}

async function openMessage(id: string) {
  selectedId.value = id;
  const item = snapshot.value.messages.find((m) => m.id === id);
  if (item?.unread)
    await run(async () => {
      await data.setMailRead(id, true);
      await load();
    });
}
async function toTask() {
  if (!selected.value || selected.value.taskId) return;
  await run(async () => {
    const m = selected.value!;
    const task = await data.createTaskFromMail(
      m.id,
      taskInputSchema.parse({
        title: `Répondre : ${m.subject || "(sans objet)"}`,
        description: [
          `E-mail de ${m.from.name || m.from.email} <${m.from.email}>`,
          "",
          m.snippet || m.bodyText.slice(0, 1000),
        ].join("\n"),
      }),
    );
    await tasks.load();
    await load();
    tasks.notice = "Tâche créée depuis l’e-mail";
    tasks.select(task.id);
  });
}
async function trackReply() {
  if (!selected.value) return;
  await run(async () => {
    await data.waitForMailReply({
      messageId: selected.value!.id,
      expectedFrom: selected.value!.from.email,
      dueDate: dueDate.value || null,
    });
    await load();
  });
}
async function resolveWaiting() {
  if (!waiting.value) return;
  await run(async () => {
    await data.resolveMailWaiting(waiting.value!.id);
    await load();
  });
}
onMounted(async () => {
  try {
    await Promise.all([
      load(),
      host?.mailAuthStatus().then((v) => {
        auth.value = v;
      }),
    ]);
  } catch (e) {
    error.value = message(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="mail-workspace">
    <header class="view-header">
      <div>
        <h1>Messagerie</h1>
        <p class="muted">Gmail et Microsoft 365, reliés à vos tâches.</p>
      </div>
      <button :disabled="busy" @click="load">
        <RefreshCw aria-hidden="true" />Actualiser le cache
      </button>
    </header>

    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="loading" class="loading" role="status">Chargement des e-mails…</div>

    <template v-else>
      <section class="mail-accounts" aria-label="Comptes de messagerie">
        <div v-for="account in snapshot.accounts" :key="account.id" class="mail-account">
          <span>
            <strong>{{ account.displayName || account.email }}</strong>
            <small>{{ account.email }} · {{ account.provider === "google" ? "Gmail" : "Microsoft 365" }}</small>
          </span>
          <span class="inline">
            <button :disabled="busy" @click="syncAccount(account.id)">Synchroniser</button>
            <button :disabled="busy" @click="disconnect(account.id)">Déconnecter</button>
          </span>
        </div>
        <div class="inline">
          <button
            v-if="host"
            :disabled="busy || !auth.googleConfigured || !auth.encryptionAvailable"
            @click="connect('google')"
          >
            Connecter Gmail
          </button>
          <button
            v-if="host"
            :disabled="busy || !auth.microsoftConfigured || !auth.encryptionAvailable"
            @click="connect('microsoft')"
          >
            Connecter Microsoft 365
          </button>
        </div>
        <p v-if="host && (!auth.googleConfigured || !auth.microsoftConfigured)" class="muted">
          Les boutons sont activés lorsque les identifiants OAuth correspondants sont configurés.
        </p>
      </section>

      <div v-if="snapshot.accounts.length" class="mail-layout">
        <aside class="mail-list" aria-label="Liste des e-mails">
          <button
            v-for="m in snapshot.messages"
            :key="m.id"
            class="mail-row"
            :class="{ active: selectedId === m.id, unread: m.unread }"
            @click="openMessage(m.id)"
          >
            <span class="mail-row-top">
              <strong>{{ m.from.name || m.from.email }}</strong>
              <time>{{ new Date(m.receivedAt).toLocaleDateString("fr-FR") }}</time>
            </span>
            <span>{{ m.subject || "(sans objet)" }}</span>
            <small>{{ m.snippet }}</small>
          </button>
          <div v-if="!snapshot.messages.length" class="empty-state compact">
            <Mail aria-hidden="true" />
            <p>Aucun e-mail en cache. Utilisez « Synchroniser » pour récupérer les messages récents.</p>
          </div>
        </aside>

        <article class="mail-reader">
          <template v-if="selected">
            <header>
              <div>
                <p class="eyebrow">{{ selectedAccount?.email }}</p>
                <h2>{{ selected.subject || "(sans objet)" }}</h2>
                <p class="muted">
                  De {{ selected.from.name || selected.from.email }} &lt;{{ selected.from.email }}&gt;
                </p>
              </div>
              <span v-if="selected.hasAttachments" class="mail-attachment-badge">
                <Paperclip aria-hidden="true" />Pièces jointes
              </span>
            </header>
            <pre class="mail-body">{{ selected.bodyText || selected.snippet }}</pre>
            <form v-if="host" class="mail-reply" @submit.prevent="sendReply">
              <label for="mail-reply-body">Répondre</label>
              <textarea
                id="mail-reply-body"
                v-model="replyBody"
                rows="5"
                maxlength="200000"
                placeholder="Écrivez votre réponse…"
              />
              <div class="form-actions">
                <button class="primary" :disabled="busy || !replyBody.trim()">
                  Envoyer la réponse
                </button>
              </div>
            </form>
            <div class="mail-actions">
              <button :disabled="busy || !!selected.taskId" @click="toTask">
                <Link2 aria-hidden="true" />{{ selected.taskId ? "Tâche liée" : "Créer une tâche" }}
              </button>
              <template v-if="!waiting || waiting.resolvedAt">
                <label>
                  Relance le
                  <input v-model="dueDate" type="date" />
                </label>
                <button :disabled="busy" @click="trackReply">
                  <Clock3 aria-hidden="true" />Attendre une réponse
                </button>
              </template>
              <button v-else :disabled="busy" @click="resolveWaiting">
                Marquer la réponse reçue
              </button>
            </div>
          </template>
          <div v-else class="empty-state">
            <Mail aria-hidden="true" />
            <h2>Choisissez un e-mail</h2>
            <p>Le contenu reste disponible hors ligne après synchronisation.</p>
          </div>
        </article>
      </div>

      <div v-else class="empty-state mail-connect-empty">
        <Mail aria-hidden="true" />
        <h2>Connectez votre première boîte mail</h2>
        <p>TaskFlow stockera le cache localement et chiffrera les jetons OAuth avec le stockage sécurisé Windows.</p>
      </div>
    </template>
  </section>
</template>
