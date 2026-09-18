import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHashHistory } from "vue-router";
import {
  TaskFlowApp,
  storeKey,
  hostKey,
  TaskWorkspace,
  DesignSystem,
  NotesWorkspace,
  MailWorkspace,
} from "@taskflow/ui";
import type { DataStore, DesktopHost } from "@taskflow/data";
import "../../../packages/ui/src/style.css";
declare global {
  interface Window {
    taskflow: { data: DataStore; host: DesktopHost };
  }
}
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/today" },
    { path: "/design", component: DesignSystem },
    { path: "/notes/:pageId?", component: NotesWorkspace },
    { path: "/mail", component: MailWorkspace },
    { path: "/:view", component: TaskWorkspace },
  ],
});
createApp(TaskFlowApp)
  .use(createPinia())
  .use(router)
  .provide(storeKey, window.taskflow.data)
  .provide(hostKey, window.taskflow.host)
  .mount("#app");
