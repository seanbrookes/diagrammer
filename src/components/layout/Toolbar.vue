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
      <input
        class="project-name-input"
        :value="projectName"
        @change="updateProject({ name: $event.target.value.trim() || 'Untitled' })"
        @keydown.enter="$event.target.blur()"
        spellcheck="false"
      />
    </div>

    <div class="toolbar-group">
      <!-- Storyboard mode: back button + undo delete -->
      <template v-if="uxState.storyboardMode">
        <button class="sb-back-btn" title="Back to canvas (M)" @click="toggleStoryboard">
          ← Canvas
        </button>
        <button class="sb-back-btn" @click="onNewScene">+ New Scene</button>
        <button v-if="deletedSceneStack.length" class="sb-back-btn" @click="undoDeleteScene">
          ↩ Undo Delete
        </button>
      </template>

      <!-- Normal mode: storyboard icon + capture scene + scene selector -->
      <template v-else>
        <button class="tool-btn" title="Storyboard (M)" @click="toggleStoryboard">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="5" height="16" rx="1"/>
            <rect x="9.5" y="4" width="5" height="16" rx="1"/>
            <rect x="17" y="4" width="5" height="16" rx="1"/>
          </svg>
        </button>
        <!-- Capture scene -->
        <button class="tool-btn" title="Capture Scene" @click="onCaptureScene">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </button>
      </template>

      <!-- Scene selector: shown when scenes exist and not in storyboard mode -->
      <div v-if="scenes.length && !uxState.storyboardMode" class="scene-selector" v-click-outside="() => sceneSelectorOpen = false">
        <button class="scene-sel-btn" :class="{ active: activeSceneId }" @click="sceneSelectorOpen = !sceneSelectorOpen">
          <span v-if="activeScene" class="scene-sel-seq">#{{ activeScene.sequence }}</span>
          <span class="scene-sel-name">{{ activeScene ? sceneLabel(activeScene) : 'Scenes' }}</span>
          <span class="scene-sel-count" v-if="!activeScene">{{ scenes.length }}</span>
          <span class="scene-sel-chevron">▾</span>
        </button>
        <div v-if="sceneSelectorOpen" class="scene-sel-dropdown">
          <div
            v-for="s in sortedScenes" :key="s.id"
            class="scene-sel-item" :class="{ active: s.id === activeSceneId }"
            @click="selectScene(s.id)"
          >
            <span class="scene-sel-item-seq">#{{ s.sequence }}</span>
            <span class="scene-sel-item-name">{{ sceneLabel(s) }}</span>
            <span class="scene-sel-item-frame">f{{ s.frame }}</span>
          </div>
          <div v-if="activeSceneId" class="scene-sel-divider" />
          <div v-if="activeSceneId" class="scene-sel-action" @click="onCloneScene">
            Clone current scene
          </div>
        </div>
      </div>
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
import { ref, computed } from 'vue'
import uxState, { setTool } from '../../stores/uxState.js'
import dataState, { updateProject } from '../../stores/dataState.js'
import { saveProject, openFilePicker, exportSvg as doExportSvg } from '../../composables/usePersistence.js'
import { captureScene, newScene, enterSceneEdit, exitSceneEdit, cloneScene, sceneLabel, deletedSceneStack, undoDeleteScene } from '../../stores/sceneStore.js'

const activeTool = computed(() => uxState.activeTool)
const projectName = computed(() => dataState.project.name)
const activeSceneId = computed(() => uxState.activeSceneId)
const scenes = computed(() => dataState.scenes)
const sortedScenes = computed(() => [...scenes.value].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)))
const activeScene = computed(() => scenes.value.find(s => s.id === activeSceneId.value) ?? null)
const sceneSelectorOpen = ref(false)

const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('mousedown', el._clickOutside)
  },
  unmounted(el) { document.removeEventListener('mousedown', el._clickOutside) },
}

function selectScene(id) {
  sceneSelectorOpen.value = false
  if (id === activeSceneId.value) return
  if (activeSceneId.value) exitSceneEdit()
  enterSceneEdit(id)
}

function onCloneScene() {
  sceneSelectorOpen.value = false
  const sourceId = activeSceneId.value
  if (!sourceId) return
  exitSceneEdit()
  const clone = cloneScene(sourceId)
  if (clone) enterSceneEdit(clone.id)
  else enterSceneEdit(sourceId)
}

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
function toggleStoryboard() { uxState.storyboardMode = !uxState.storyboardMode }
function onNewScene() { newScene() }
function onCaptureScene() { captureScene() }
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

.project-name-input {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 8px;
  text-align: center;
  min-width: 80px;
  max-width: 240px;
  width: auto;
  transition: border-color 0.15s;
}
.project-name-input:hover { border-color: var(--border) }
.project-name-input:focus { outline: none; border-color: #4a90e2; color: var(--text) }

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

.sb-back-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  height: 32px;
  align-self: center;
  transition: background 0.1s, border-color 0.1s;
}
.sb-back-btn:hover { background: var(--surface-2); border-color: var(--text-muted, #666); }

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

/* Scene selector */
.scene-selector {
  position: relative;
  align-self: center;
}

.scene-sel-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  height: 32px;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s;
}
.scene-sel-btn:hover { background: var(--surface-2) }
.scene-sel-btn.active { border-color: #4a90e2; color: #aad0f5 }

.scene-sel-seq { color: #6db3f2; font-weight: 600; font-size: 11px }
.scene-sel-name { font-weight: 500 }
.scene-sel-count {
  background: var(--surface-2);
  border-radius: 10px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--text-muted, #888);
}
.scene-sel-chevron { font-size: 10px; opacity: 0.5; margin-left: 2px }

.scene-sel-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 100;
  overflow: hidden;
}

.scene-sel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text);
  transition: background 0.1s;
}
.scene-sel-item:hover { background: var(--surface-2) }
.scene-sel-item.active { background: rgba(74,144,226,0.12); color: #aad0f5 }
.scene-sel-item-seq { color: #6db3f2; font-weight: 600; font-size: 11px; flex-shrink: 0 }
.scene-sel-item-name { flex: 1 }
.scene-sel-item-frame { font-size: 11px; color: var(--text-muted, #666) }
.scene-sel-divider { height: 1px; background: var(--border); margin: 4px 0 }
.scene-sel-action {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted, #888);
  transition: background 0.1s, color 0.1s;
}
.scene-sel-action:hover { background: var(--surface-2); color: var(--text) }
</style>
