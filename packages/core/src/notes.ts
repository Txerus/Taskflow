import { z } from "zod";
export type NoteKind = "notebook" | "section" | "page";
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  marks?: { type: string; attrs?: Record<string, any> }[];
  content?: RichNode[];
}
export interface Notebook {
  id: string;
  name: string;
  revision: number;
}
export interface NoteSection extends Notebook {
  notebookId: string;
}
export interface NotePage {
  id: string;
  sectionId: string;
  title: string;
  content: RichNode;
  revision: number;
  updatedAt: string;
}
export interface NotesSnapshot {
  notebooks: Notebook[];
  sections: NoteSection[];
  pages: NotePage[];
}
export interface SearchHit {
  kind: "page" | "task";
  id: string;
  title: string;
  excerpt: string;
}
export const noteName = z.string().trim().min(1, "Un nom est requis.").max(200);
export const noteId = z.string().uuid();
export const revisionSchema = z.number().int().positive();
export const notebookInput = z.object({
  id: noteId.optional(),
  revision: revisionSchema.optional(),
  name: noteName,
});
export const sectionInput = notebookInput.extend({ notebookId: noteId });
const nodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "taskList",
  "taskItem",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "image",
  "reference",
]);
const marks = new Set(["bold", "italic", "strike", "code", "underline"]);
export function walkNotes(node: RichNode, fn: (n: RichNode) => void) {
  fn(node);
  node.content?.forEach((n) => walkNotes(n, fn));
}
export function plainText(node: RichNode): string {
  return [
    node.text ??
      (node.type === "reference" ? String(node.attrs?.label ?? "") : ""),
    ...(node.content ?? []).map(plainText),
  ]
    .filter(Boolean)
    .join(" ");
}
export function validateDocument(raw: unknown): RichNode {
  const json = JSON.stringify(raw);
  if (!json || json.length > 8_000_000)
    throw new Error("Page trop volumineuse (8 Mo maximum).");
  const root = JSON.parse(json) as RichNode;
  let count = 0;
  const itemIds = new Set<string>();
  function visit(n: RichNode, depth: number): RichNode {
    if (
      !n ||
      typeof n !== "object" ||
      !nodes.has(n.type) ||
      depth > 30 ||
      ++count > 15000
    )
      throw new Error("Contenu de page invalide.");
    const out: RichNode = { type: n.type };
    if (n.text !== undefined) out.text = z.string().max(200000).parse(n.text);
    if (n.marks)
      out.marks = z
        .array(z.object({ type: z.string().refine((t) => marks.has(t)) }))
        .max(5)
        .parse(n.marks);
    const a = n.attrs ?? {};
    if (n.type === "heading")
      out.attrs = { level: z.number().int().min(1).max(3).parse(a.level) };
    if (n.type === "orderedList")
      out.attrs = {
        start: z
          .number()
          .int()
          .min(1)
          .max(100000)
          .parse(a.start ?? 1),
      };
    if (n.type === "codeBlock") out.attrs = { language: null };
    if (n.type === "taskItem") {
      const itemId = a.itemId ? noteId.parse(a.itemId) : null;
      if (itemId && itemIds.has(itemId))
        throw new Error("Élément de checklist dupliqué.");
      if (itemId) itemIds.add(itemId);
      out.attrs = {
        checked: z.boolean().parse(a.checked ?? false),
        itemId,
        taskId: a.taskId ? noteId.parse(a.taskId) : null,
      };
    }
    if (n.type === "reference")
      out.attrs = {
        kind: z.enum(["page", "task"]).parse(a.kind),
        targetId: noteId.parse(a.targetId),
        label: noteName.parse(a.label),
      };
    if (n.type === "image") {
      const src = z
        .string()
        .max(4_000_000)
        .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
        .parse(a.src);
      out.attrs = {
        src,
        alt: z
          .string()
          .max(500)
          .parse(a.alt ?? ""),
        title: null,
      };
    }
    if (n.type === "tableCell" || n.type === "tableHeader")
      out.attrs = {
        colspan: z
          .number()
          .int()
          .min(1)
          .max(30)
          .parse(a.colspan ?? 1),
        rowspan: z
          .number()
          .int()
          .min(1)
          .max(100)
          .parse(a.rowspan ?? 1),
        colwidth: null,
      };
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) throw new Error("Contenu invalide.");
      out.content = n.content.map((c) => visit(c, depth + 1));
    }
    return out;
  }
  if (root?.type !== "doc") throw new Error("Document attendu.");
  return visit(root, 0);
}
export const documentSchema = z.unknown().transform((v, ctx) => {
  try {
    return validateDocument(v);
  } catch (e) {
    ctx.addIssue({
      code: "custom",
      message: e instanceof Error ? e.message : "Document invalide",
    });
    return z.NEVER;
  }
});
export const pageInput = z.object({
  id: noteId.optional(),
  revision: revisionSchema.optional(),
  sectionId: noteId,
  title: noteName,
  content: documentSchema,
});
export const emptyDocument = (): RichNode => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});
