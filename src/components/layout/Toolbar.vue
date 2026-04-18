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
        <span class="tool-icon">💾</span>
      </button>
      <button class="tool-btn" title="Open" @click="open">
        <span class="tool-icon">📂</span>
      </button>
      <button class="tool-btn" title="Export SVG" @click="exportSvg">
        <span class="tool-icon">⬇️</span>
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
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
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
