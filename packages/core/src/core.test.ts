import { describe, it, expect } from "vitest";
import {
  parseQuickTask,
  nextOccurrence,
  taskInputSchema,
  priorityScore,
  daySchema,
} from "./index";
describe("saisie française", () => {
  const now = new Date(2026, 8, 17, 9, 0);
  it("extrait titre, vendredi, heure, priorité et étiquette", () => {
    const p = parseQuickTask("relancer client vendredi 10h #pro !haute", now);
    expect(p.input.title).toBe("relancer client");
    expect(p.input.dueDate).toBe("2026-09-18");
    expect(new Date(p.input.reminderAt!).getHours()).toBe(10);
    expect(p.input.priority).toBe(1);
    expect(p.tagNames).toEqual(["pro"]);
  });
  it.each([
    ["demain", "2026-09-18"],
    ["après-demain", "2026-09-19"],
    ["aujourd'hui", "2026-09-17"],
    ["lundi", "2026-09-21"],
  ])("comprend %s", (word, date) =>
    expect(parseQuickTask(`Vérifier ${word}`, now).input.dueDate).toBe(date),
  );
  it("conserve le texte inconnu", () =>
    expect(
      parseQuickTask("Client à rappeler dans un moment", now).input.title,
    ).toBe("Client à rappeler dans un moment"));
  it("valide une date réelle", () => {
    expect(daySchema.safeParse("2026-02-30").success).toBe(false);
    expect(parseQuickTask("Vérifier 2026-02-30", now).warnings).toHaveLength(1);
  });
  it("refuse le titre vide", () =>
    expect(() => parseQuickTask("demain #pro !1", now)).toThrow());
  it("initialise la récurrence", () =>
    expect(
      parseQuickTask("Contrôler chaque mois", now).input.recurrence,
    ).toEqual({ unit: "month", interval: 1, anchorDay: 17 }));
  it.each(["CHAQUE MOIS", "Chaque Mois", "chaque mois"])(
    "gère la casse %s",
    (s) =>
      expect(parseQuickTask("Contrôle " + s).input.recurrence?.unit).toBe(
        "month",
      ),
  );
});
describe("dates et score", () => {
  it("conserve la fin de mois", () => {
    const r = { unit: "month" as const, interval: 1, anchorDay: 31 };
    expect(nextOccurrence("2026-01-31", r)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", r)).toBe("2026-03-31");
  });
  it("gère une année bissextile", () =>
    expect(nextOccurrence("2024-02-29", { unit: "year", interval: 1 })).toBe(
      "2025-02-28",
    ));
  it("gère le changement d’année", () =>
    expect(nextOccurrence("2026-12-28", { unit: "week", interval: 1 })).toBe(
      "2027-01-04",
    ));
  it("refuse récurrence sans échéance", () =>
    expect(
      taskInputSchema.safeParse({
        title: "Test",
        recurrence: { unit: "day", interval: 1 },
      }).success,
    ).toBe(false));
  it("priorise une tâche urgente en retard", () => {
    const a = taskInputSchema.parse({ title: "A" }),
      b = { ...a, urgent: true, dueDate: "2026-01-01" };
    expect(priorityScore(b, new Date(2026, 8, 17))).toBeGreaterThan(
      priorityScore(a, new Date(2026, 8, 17)),
    );
    expect(priorityScore({ ...b, status: "done" })).toBe(-1);
  });
});
