import { describe, expect, it } from "vitest";
import { detectMailAction } from "./mail";

describe("détection locale des demandes e-mail", () => {
  it("suggère une tâche pour une demande française explicite", () => {
    const result = detectMailAction({
      subject: "Offre mise à jour",
      bodyText: "Bonjour, pouvez-vous vérifier l'offre et me répondre avant vendredi ?",
    });
    expect(result.actionable).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.reasons).toContain("demande explicite");
    expect(result.reasons).toContain("échéance mentionnée");
    expect(result.suggestedTitle).toBe("Traiter : Offre mise à jour");
  });

  it("détecte aussi une demande anglaise", () => {
    const result = detectMailAction({
      subject: "Updated drawing",
      bodyText: "Could you please review the drawing and confirm by Monday?",
    });
    expect(result.actionable).toBe(true);
    expect(result.reasons).toContain("action identifiable");
  });

  it("ne transforme pas une information neutre en tâche", () => {
    const result = detectMailAction({
      subject: "Information",
      bodyText: "La réunion a eu lieu ce matin. Le compte rendu est joint.",
    });
    expect(result.actionable).toBe(false);
  });

  it("retire le préfixe de réponse du titre suggéré", () => {
    expect(
      detectMailAction({ subject: "RE: Planning", bodyText: "Merci de confirmer." })
        .suggestedTitle,
    ).toBe("Traiter : Planning");
  });
});
