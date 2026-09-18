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
