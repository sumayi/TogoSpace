<script setup lang="ts">
import type { SettingsBreadcrumbItem } from './types';

defineProps<{
  items: SettingsBreadcrumbItem[];
}>();

const emit = defineEmits<{
  navigate: [key: string];
}>();
</script>

<template>
  <nav class="settings-breadcrumb" aria-label="当前位置">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="breadcrumb-link"
      :class="{ current: item.current }"
      @click="!item.current && emit('navigate', item.key)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>

<style scoped>
.settings-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.breadcrumb-link {
  position: relative;
  border: none;
  background: transparent;
  color: var(--hint-text);
  padding: 0;
  cursor: pointer;
  font-size: 0.92rem;
  line-height: 1.3;
}

.breadcrumb-link:not(:last-child)::after {
  content: '/';
  margin-left: 6px;
  color: var(--panel-border);
}

.breadcrumb-link.current {
  color: var(--text-strong);
  cursor: default;
}

.breadcrumb-link:hover:not(.current) {
  color: var(--accent);
}
</style>
