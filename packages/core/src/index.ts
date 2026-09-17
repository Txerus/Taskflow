import { z } from "zod";
export const idSchema = z.string().uuid();
export function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00");
    return !isNaN(+d) && localDay(d) === s;
  }, "Date invalide");
export const statusSchema = z.enum(["todo", "doing", "waiting", "done"]);
export type Status = z.infer<typeof statusSchema>;
export const statusLabels: Record<Status, string> = {
  todo: "À faire",
  doing: "En cours",
  waiting: "En attente",
  done: "Fait",
};
export const recurrenceSchema = z
  .object({
    unit: z.enum(["day", "week", "month", "year"]),
    interval: z.number().int().min(1).max(365),
    anchorDay: z.number().int().min(1).max(31).optional(),
  })
  .strict();
export type Recurrence = z.infer<typeof recurrenceSchema>;
export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, "Saisissez un titre").max(500),
    description: z.string().max(50000).default(""),
    parentId: idSchema.nullable().default(null),
    projectId: idSchema.nullable().default(null),
    dueDate: daySchema.nullable().default(null),
    reminderAt: z.iso.datetime().nullable().default(null),
    priority: z.number().int().min(1).max(4).default(3),
    urgent: z.boolean().default(false),
    important: z.boolean().default(false),
    effort: z.number().int().min(0).max(100000).default(0),
    status: statusSchema.default("todo"),
    recurrence: recurrenceSchema.nullable().default(null),
    tagIds: z.array(idSchema).max(50).default([]),
  })
  .strict()
  .refine((v) => !v.recurrence || !!v.dueDate, {
    message: "Une récurrence nécessite une échéance",
    path: ["dueDate"],
  });
export type TaskInput = z.infer<typeof taskInputSchema>;
export interface Task extends TaskInput {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  recurrenceFrom: string | null;
}
export interface Project {
  id: string;
  name: string;
}
export interface Tag {
  id: string;
  name: string;
}
export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
}
export interface Attachment {
  id: string;
  taskId: string;
  name: string;
  size: number;
  createdAt: string;
}
export const namedSchema = z
  .object({ id: idSchema.optional(), name: z.string().trim().min(1).max(100) })
  .strict();
export const preferencesSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    launchAtLogin: z.boolean(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export function taskDto(t: Task): TaskInput {
  const {
    id,
    revision,
    createdAt,
    updatedAt,
    completedAt,
    recurrenceFrom,
    ...input
  } = t;
  return input;
}
export function addDays(day: string, amount: number) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + amount);
  return localDay(d);
}
export function nextOccurrence(day: string, r: Recurrence) {
  daySchema.parse(day);
  recurrenceSchema.parse(r);
  if (r.unit === "day" || r.unit === "week")
    return addDays(day, r.interval * (r.unit === "week" ? 7 : 1));
  const d = new Date(day + "T12:00:00"),
    anchor = r.anchorDay ?? d.getDate();
  d.setDate(1);
  if (r.unit === "month") d.setMonth(d.getMonth() + r.interval);
  else d.setFullYear(d.getFullYear() + r.interval);
  d.setDate(
    Math.min(anchor, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
  );
  return localDay(d);
}
export function priorityScore(t: TaskInput, now = new Date()) {
  if (t.status === "done") return -1;
  const today = localDay(now);
  return (
    (5 - t.priority) * 20 +
    (t.urgent ? 25 : 0) +
    (t.important ? 25 : 0) +
    (t.dueDate
      ? t.dueDate < today
        ? 45
        : t.dueDate === today
          ? 30
          : t.dueDate <= addDays(today, 7)
            ? 10
            : 0
      : 0) -
    (t.effort > 120 ? 5 : 0)
  );
}
export function rankTasks(tasks: Task[], now = new Date()) {
  return [...tasks].sort(
    (a, b) =>
      priorityScore(b, now) - priorityScore(a, now) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}
export function parseQuickTask(
  text: string,
  now = new Date(),
): { input: TaskInput; tagNames: string[]; warnings: string[] } {
  let title = text.trim(),
    dueDate: string | null = null,
    reminderAt: string | null = null,
    priority = 3,
    recurrence: Recurrence | null = null;
  const tagNames: string[] = [],
    warnings: string[] = [];
  title = title.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (_, t: string) => {
    tagNames.push(t);
    return " ";
  });
  title = title.replace(
    /(?:^|\s)(?:!p?([1-4])|!(haute|moyenne|basse))/gi,
    (_, n: string, l: string) => {
      priority = n
        ? Number(n)
        : l.toLowerCase() === "haute"
          ? 1
          : l.toLowerCase() === "moyenne"
            ? 2
            : 4;
      return " ";
    },
  );
  title = title.replace(
    /\btous les jours\b|\bchaque (jour|semaine|mois|année)\b/giu,
    (m: string) => {
      m = m.toLowerCase();
      recurrence = {
        unit: m.includes("semaine")
          ? "week"
          : m.includes("mois")
            ? "month"
            : m.includes("année")
              ? "year"
              : "day",
        interval: 1,
      };
      return " ";
    },
  );
  const explicit = title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicit) {
    if (daySchema.safeParse(explicit[1]).success) {
      dueDate = explicit[1];
      title = title.replace(explicit[0], " ");
    } else warnings.push("Date non reconnue : vérifiez le calendrier.");
  }
  if (!dueDate)
    title = title.replace(
      /\b(aujourd’hui|aujourd'hui|demain|après-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/iu,
      (word: string) => {
        const s = word.toLowerCase(),
          names = [
            "dimanche",
            "lundi",
            "mardi",
            "mercredi",
            "jeudi",
            "vendredi",
            "samedi",
          ];
        const offset =
          s === "demain"
            ? 1
            : s === "après-demain"
              ? 2
              : s.startsWith("aujourd")
                ? 0
                : (names.indexOf(s) - now.getDay() + 7) % 7;
        dueDate = addDays(localDay(now), offset);
        return " ";
      },
    );
  title = title.replace(
    /\b([01]?\d|2[0-3])h([0-5]\d)?\b/i,
    (_, h: string, m: string) => {
      dueDate ??= localDay(now);
      reminderAt = new Date(
        `${dueDate}T${h.padStart(2, "0")}:${m ?? "00"}:00`,
      ).toISOString();
      return " ";
    },
  );
  if (recurrence) {
    dueDate ??= localDay(now);
    (recurrence as Recurrence).anchorDay = Number(dueDate.slice(-2));
  }
  const input = taskInputSchema.parse({
    title: title.replace(/\s+/g, " ").trim(),
    dueDate,
    reminderAt,
    priority,
    recurrence,
  });
  if (input.reminderAt && input.reminderAt < now.toISOString())
    warnings.push(
      "Ce rappel est passé : il sera signalé au prochain contrôle.",
    );
  return { input, tagNames: [...new Set(tagNames)], warnings };
}
