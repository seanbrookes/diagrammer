<template>
  <header class="toolbar">
    <div class="toolbar-group">
      <button
        v-for="tool in tools" :key="tool.id"
        class="tool-btn"
        :class="{ active: activeTool === tool.id }"
        :title="`${tool.label} (${tool.key})`"
        @click="setTool(tool.id)"
      >
        <span class="tool-icon" v-html="tool.icon" />
      </button>
    </div>

    <div class="toolbar-center">
      <span class="project-name">{{ projectName }}</span>
    </div>

    <div class="toolbar-group">
      <button class="tool-btn" title="Save (Ctrl+S)" @click="save">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
      </button>
      <button class="tool-btn" title="Open" @click="open">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button class="tool-btn" title="Export SVG" @click="exportSvg">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import uxState, { setTool } from '../../stores/uxState.js'
import dataState from '../../stores/dataState.js'
import { saveProject, openFilePicker, exportSvg as doExportSvg } from '../../composables/usePersistence.js'

const activeTool = computed(() => uxState.activeTool)
const projectName = computed(() => dataState.project.name)

const tools = [
  { id: 'select',  label: 'Select',    key: 'V', icon: '↖' },
  { id: 'rect',    label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse',   key: 'E', icon: '⬭' },
  { id: 'line',    label: 'Line',      key: 'L', icon: '╱' },
  { id: 'arrow',   label: 'Arrow',     key: 'A', icon: '→' },
  { id: 'text',    label: 'Text',      key: 'T', icon: 'T' },
  { id: 'path',    label: 'Path',      key: 'P', icon: '✏' },
  { id: 'pen',      label: 'Pen',      key: 'B', icon: '✒' },
  {
    id: 'snapshot', label: 'Snapshot', key: 'C',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>`,
  },
]

function save() { saveProject() }
function open() { openFilePicker() }
function exportSvg() { doExportSvg() }
</script>

<style scoped>
.toolbar {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  height: var(--toolbar-h);
  user-select: none;
}

.toolbar-group + .toolbar-group {
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid var(--border);
}

.toolbar-group {
  display: flex;
  gap: 2px;
}

.toolbar-center {
  flex: 1;
  text-align: center;
}

.project-name {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 22px;
  transition: background 0.1s, border-color 0.1s;
}

.tool-btn:hover {
  background: var(--surface-2);
  border-color: var(--border);
}

.tool-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tool-icon {
  font-style: normal;
  line-height: 1;
}
</style>
