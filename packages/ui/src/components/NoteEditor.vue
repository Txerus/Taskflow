<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent, Node, mergeAttributes } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import type { RichNode } from "@taskflow/core";
const props = defineProps<{ content: RichNode; disabled: boolean }>();
const emit = defineEmits<{
  change: [content: RichNode];
  reference: [kind: "page" | "task", query: string];
  navigate: [kind: "page" | "task", id: string];
  error: [message: string];
}>();
const reference = Node.create({
  name: "reference",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      kind: { default: "page" },
      targetId: { default: null },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "button[data-reference]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "button",
      mergeAttributes(HTMLAttributes, {
        "data-reference": node.attrs.kind,
        "data-target": node.attrs.targetId,
        type: "button",
        class: "note-reference",
        contenteditable: "false",
      }),
      node.attrs.kind === "page"
        ? `[[${node.attrs.label}]]`
        : `@${node.attrs.label}`,
    ];
  },
});
const linkedItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      itemId: { default: null, parseHTML: () => null },
      taskId: { default: null, parseHTML: () => null },
    };
  },
});
let trigger: { from: number; to: number } | null = null;
const editor = useEditor({
  content: props.content,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
    TaskList,
    linkedItem.configure({ nested: false }),
    TableKit,
    Image.configure({ allowBase64: true }),
    reference,
  ],
  editorProps: {
    attributes: {
      role: "textbox",
      "aria-label": "Contenu de la page",
      "aria-multiline": "true",
    },
    handleClick(_view, _pos, event) {
      const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-reference]",
      );
      if (!el) return false;
      emit(
        "navigate",
        el.dataset.reference as "page" | "task",
        el.dataset.target!,
      );
      return true;
    },
  },
  onUpdate({ editor }) {
    emit("change", editor.getJSON() as RichNode);
    const { from, $from } = editor.state.selection;
    const text = $from.parent.textBetween(
      0,
      $from.parentOffset,
      "\n",
      "\ufffc",
    );
    const match = text.match(
      /(?:\[\[([^\]\n]{0,80})|(?:^|\s)@([^\s@]{0,80}))$/,
    );
    if (match && match[0].trim().length >= 2) {
      const token = match[0].trimStart();
      trigger = { from: from - token.length, to: from };
      emit(
        "reference",
        match[1] !== undefined ? "page" : "task",
        match[1] ?? match[2] ?? "",
      );
    }
  },
});
watch(
  () => props.disabled,
  (v) => editor.value?.setEditable(!v, false),
);
function replace(content: RichNode) {
  editor.value?.commands.setContent(content, { emitUpdate: false });
}
function insertReference(kind: "page" | "task", id: string, label: string) {
  const chain = editor.value?.chain().focus();
  if (trigger) chain?.deleteRange(trigger);
  chain
    ?.insertContent([
      { type: "reference", attrs: { kind, targetId: id, label } },
      { type: "text", text: " " },
    ])
    .run();
  trigger = null;
}
function openReference(kind: "page" | "task") {
  trigger = null;
  emit("reference", kind, "");
}
function cancelReference() {
  trigger = null;
}
function addTaskItem(id: string, title: string) {
  editor.value
    ?.chain()
    .focus()
    .insertContent({
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { itemId: id, checked: false },
          content: [
            { type: "paragraph", content: [{ type: "text", text: title }] },
          ],
        },
      ],
    })
    .run();
}
async function image(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 2_500_000
  ) {
    emit("error", "Choisissez une image PNG, JPEG ou WebP de moins de 2,5 Mo.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () =>
    editor.value
      ?.chain()
      .focus()
      .setImage({ src: String(reader.result), alt: file.name })
      .run();
  reader.onerror = () => emit("error", "Impossible de lire cette image.");
  reader.readAsDataURL(file);
}
onBeforeUnmount(() => editor.value?.destroy());
defineExpose({ replace, insertReference, cancelReference, addTaskItem });
</script>
<template>
  <div class="note-editor" v-if="editor">
    <div
      class="editor-toolbar"
      role="group"
      aria-label="Mise en forme"
      @mousedown.prevent
    >
      <button
        type="button"
        :disabled="disabled"
        :aria-pressed="editor.isActive('bold')"
        @click="editor.chain().focus().toggleBold().run()"
      >
        Gras
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-pressed="editor.isActive('italic')"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        Italique
      </button>
      <button
        type="button"
        :disabled="disabled"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        Titre
      </button>
      <button
        type="button"
        :disabled="disabled"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        Liste
      </button>
      <button
        type="button"
        :disabled="disabled"
        @click="editor.chain().focus().toggleTaskList().run()"
      >
        Checklist
      </button>
      <button
        type="button"
        :disabled="disabled"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      >
        Code
      </button>
      <button
        type="button"
        :disabled="disabled"
        @click="
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        "
      >
        Tableau
      </button>
      <button
        v-if="editor.isActive('table')"
        type="button"
        :disabled="disabled"
        @click="editor.chain().focus().addRowAfter().run()"
      >
        Ajouter une ligne
      </button>
      <button
        v-if="editor.isActive('table')"
        type="button"
        :disabled="disabled"
        @click="editor.chain().focus().deleteTable().run()"
      >
        Supprimer le tableau
      </button>
      <button type="button" :disabled="disabled" @click="openReference('page')">
        [[Page]]
      </button>
      <button type="button" :disabled="disabled" @click="openReference('task')">
        @Tâche
      </button>
    </div>
    <label class="image-picker"
      >Insérer une image<input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :disabled="disabled"
        @change="image"
    /></label>
    <EditorContent :editor="editor" />
  </div>
</template>
