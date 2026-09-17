<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
import { X } from "lucide-vue-next";
defineProps<{ open: boolean; title: string; description: string }>();
defineEmits<{ "update:open": [value: boolean] }>();
</script>
<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)"
    ><DialogPortal
      ><DialogOverlay class="modal-overlay" /><DialogContent
        class="modal-content"
        ><div class="panel-heading">
          <DialogTitle as="h2">{{ title }}</DialogTitle
          ><DialogClose class="icon-button" aria-label="Fermer"
            ><X aria-hidden="true"
          /></DialogClose>
        </div>
        <DialogDescription class="muted">{{ description }}</DialogDescription
        ><slot /></DialogContent></DialogPortal
  ></DialogRoot>
</template>
