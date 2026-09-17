import type { InjectionKey } from "vue";
import type { DataStore, DesktopHost } from "@taskflow/data";
export const storeKey: InjectionKey<DataStore> = Symbol("TaskFlow.DataStore");
export const hostKey: InjectionKey<DesktopHost> = Symbol(
  "TaskFlow.DesktopHost",
);
