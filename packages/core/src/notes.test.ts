import { describe, it, expect } from "vitest";
import { validateDocument, plainText } from "./notes";
describe("documents de pages", () => {
  it("retire les attributs non autorisés et extrait le texte", () => {
    const d = validateDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { onclick: "bad" },
          content: [
            { type: "text", text: "Bonjour", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });
    expect(d.content![0].attrs).toBeUndefined();
    expect(plainText(d)).toBe("Bonjour");
  });
  it("accepte les blocs Tiptap de Phase 2", () => {
    const doc = validateDocument({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Compte rendu" }],
        },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "P1 = urgent" }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Action" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Relancer" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Envoyer le rapport" }],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
            alt: "Schéma",
            title: null,
          },
        },
      ],
    });
    expect(doc.content?.map((node) => node.type)).toEqual([
      "heading",
      "codeBlock",
      "table",
      "taskList",
      "image",
    ]);
    expect(plainText(doc)).toContain("Envoyer le rapport");
  });
  it("refuse les marques actives et les documents trop profonds", () => {
    expect(() =>
      validateDocument({
        type: "doc",
        content: [
          {
            type: "text",
            text: "a",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      }),
    ).toThrow();
    let n: any = { type: "paragraph" };
    for (let i = 0; i < 32; i++) n = { type: "blockquote", content: [n] };
    expect(() => validateDocument({ type: "doc", content: [n] })).toThrow();
  });
});
