<template>
  <aside class="properties-panel">
    <template v-if="el">
      <!-- Element name -->
      <section class="prop-section name-section">
        <input
          class="name-input"
          :value="el.label ?? el.type"
          @change="handleRename($event.target.value)"
          @keydown.enter="$event.target.blur()"
          spellcheck="false"
        />
        <span v-if="renameWarning" class="rename-warning">{{ renameWarning }}</span>
      </section>

      <!-- Group name (when element belongs to a group) -->
      <section v-if="isGrouped && groupInfo" class="prop-section">
        <div class="prop-row">
          <label>Group</label>
          <input
            type="text"
            :value="groupInfo.name"
            @change="handleGroupRename($event.target.value)"
            @keydown.enter="$event.target.blur()"
            spellcheck="false"
          />
        </div>
        <span v-if="groupRenameWarning" class="rename-warning">{{ groupRenameWarning }}</span>
        <div class="prop-row" style="margin-top:2px">
          <button class="add-kf-btn" style="flex:1" @click="ungroup">Ungroup <kbd>⌘⇧G</kbd></button>
        </div>
      </section>

      <!-- Group selection button (multi-select, not yet grouped) -->
      <section v-else-if="isMultiSelect" class="prop-section">
        <button class="add-kf-btn" @click="group">Group selection <kbd>⌘G</kbd></button>
      </section>

      <!-- Position / Size -->
      <section class="prop-section">
        <div class="prop-row" v-if="'x' in el">
          <label>X</label>
          <input type="number" :value="round(el.x)" @change="patch({ x: +$event.target.value })" />
        </div>
        <div class="prop-row" v-if="'y' in el">
          <label>Y</label>
          <input type="number" :value="round(el.y)" @change="patch({ y: +$event.target.value })" />
        </div>
        <div class="prop-row" v-if="'width' in el">
          <label>W</label>
          <input type="number" :value="round(el.width)" @change="patch({ width: +$event.target.value })" />
        </div>
        <div class="prop-row" v-if="'height' in el">
          <label>H</label>
          <input type="number" :value="round(el.height)" @change="patch({ height: +$event.target.value })" />
        </div>
        <div class="prop-row" v-if="'rx' in el && el.type === 'rect'">
          <label>Radius</label>
          <input type="number" :value="round(el.rx ?? 0)" @change="patch({ rx: +$event.target.value })" />
        </div>
      </section>

      <!-- Fill / Stroke -->
      <section class="prop-section" v-if="el.fill !== undefined && el.fill !== 'none'">
        <div class="prop-row">
          <label>Fill</label>
          <input type="color" :value="el.fill" @input="patch({ fill: $event.target.value })" />
          <span class="color-hex">{{ el.fill }}</span>
        </div>
      </section>

      <section class="prop-section" v-if="el.stroke !== undefined && el.stroke !== 'none'">
        <div class="prop-row">
          <label>Stroke</label>
          <input type="color" :value="el.stroke" @input="patch({ stroke: $event.target.value })" />
          <span class="color-hex">{{ el.stroke }}</span>
        </div>
        <div class="prop-row">
          <label>Width</label>
          <input type="number" :value="el.strokeWidth ?? 2" step="0.5" min="0"
            @change="patch({ strokeWidth: +$event.target.value })" />
        </div>
      </section>

      <!-- Opacity -->
      <section class="prop-section">
        <div class="prop-row">
          <label>Opacity</label>
          <input type="range" min="0" max="1" step="0.01"
            :value="el.opacity ?? 1"
            @input="patch({ opacity: +$event.target.value })" />
          <span class="color-hex">{{ Math.round((el.opacity ?? 1) * 100) }}%</span>
        </div>
      </section>

      <!-- Text content -->
      <section class="prop-section" v-if="el.type === 'text'">
        <div class="prop-row column">
          <label>Content</label>
          <textarea rows="3" :value="el.content" @input="patch({ content: $event.target.value })" />
        </div>
        <div class="prop-row">
          <label>Size</label>
          <input type="number" :value="el.fontSize ?? 18" min="6" max="200"
            @change="patch({ fontSize: +$event.target.value })" />
        </div>
      </section>

      <!-- Corner radius for rect -->
      <section class="prop-section">
        <div class="prop-row">
          <label>Layer</label>
          <span class="layer-label">{{ el.zIndex ?? 0 }}</span>
          <button class="mini-btn" @click="bringForward(el.id)" title="Bring forward">↑</button>
          <button class="mini-btn" @click="sendBackward(el.id)" title="Send backward">↓</button>
        </div>
      </section>

      <!-- Add Keyframe -->
      <section class="prop-section">
        <button class="add-kf-btn" @click="addKf">+ Add Keyframe at frame {{ currentFrame }}</button>
      </section>
    </template>

    <template v-else>
      <!-- Canvas / project settings when nothing selected -->
      <div class="panel-title">Canvas</div>

      <section class="prop-section">
        <div class="prop-row">
          <label>Name</label>
          <input type="text" :value="project.name"
            @change="patchProject({ name: $event.target.value })" />
        </div>
      </section>

      <section class="prop-section">
        <div class="prop-row">
          <label>W</label>
          <input type="number" :value="project.canvasWidth" min="100" max="7680"
            @change="patchProject({ canvasWidth: +$event.target.value })" />
        </div>
        <div class="prop-row">
          <label>H</label>
          <input type="number" :value="project.canvasHeight" min="100" max="4320"
            @change="patchProject({ canvasHeight: +$event.target.value })" />
        </div>
        <div class="preset-grid">
          <button v-for="p in sizePresets" :key="p.label" class="preset-btn"
            :class="{ active: project.canvasWidth === p.w && project.canvasHeight === p.h }"
            @click="patchProject({ canvasWidth: p.w, canvasHeight: p.h })">
            {{ p.label }}
          </button>
        </div>
      </section>

      <section class="prop-section">
        <div class="prop-row">
          <label>BG</label>
          <input type="color" :value="effectiveBg"
            @input="setBackground($event.target.value)" />
          <span class="color-hex">{{ effectiveBg }}</span>
        </div>
      </section>

      <section class="prop-section">
        <div class="prop-row">
          <label>FPS</label>
          <input type="number" :value="project.fps" min="1" max="120"
            @change="patchProject({ fps: +$event.target.value })" />
        </div>
        <div class="prop-row">
          <label>Frames</label>
          <input type="number" :value="project.totalFrames" min="1" max="36000"
            @change="patchProject({ totalFrames: +$event.target.value })" />
        </div>
      </section>

      <section class="prop-section">
        <div class="prop-row">
          <label>Grid</label>
          <input type="checkbox" :checked="grid.visible" @change="grid.visible = $event.target.checked" />
          <span class="toggle-label">Show</span>
          <input type="checkbox" :checked="grid.snap" @change="grid.snap = $event.target.checked" style="margin-left:8px" />
          <span class="toggle-label">Snap</span>
        </div>
        <div class="prop-row">
          <label>Spacing</label>
          <input type="range" min="5" max="100" step="5"
            :value="grid.spacing"
            @input="grid.spacing = +$event.target.value" />
          <span class="color-hex">{{ grid.spacing }}px</span>
        </div>
        <div class="prop-row">
          <label>Point Snap</label>
          <input type="checkbox" :checked="uxState.pointSnap" @change="uxState.pointSnap = $event.target.checked" />
          <span class="toggle-label" style="flex:1">Snap lines &amp; pen to element points</span>
        </div>
        <div class="prop-row" :style="{ opacity: uxState.pointSnap ? 1 : 0.4 }">
          <label>Auto-group</label>
          <input type="checkbox" :checked="uxState.autoGroupOnSnap" :disabled="!uxState.pointSnap"
            @change="uxState.autoGroupOnSnap = $event.target.checked" />
          <span class="toggle-label" style="flex:1">Group on snap</span>
        </div>
      </section>

      <section class="prop-section">
        <div class="prop-row">
          <label>Zoom</label>
          <input type="range" min="0.1" max="4" step="0.05"
            :value="canvasZoom"
            @input="setZoom(+$event.target.value)" />
          <span class="color-hex">{{ Math.round(canvasZoom * 100) }}%</span>
        </div>
        <button class="preset-btn" style="width:100%" @click="fitToScreen">Fit to screen</button>
      </section>

      <section class="prop-section">
        <div class="hint-grid">
          <span v-for="t in toolHints" :key="t.key" class="hint">
            <kbd>{{ t.key }}</kbd> {{ t.label }}
          </span>
        </div>
      </section>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState, {
  updateElement, updateProject, addKeyframe,
  bringForward as bringFwd, sendBackward as sendBwd,
  groupElements, ungroupElements,
  renameElement, setGroupName,
} from '../../stores/dataState.js'
import { syncProxyToElement } from '../../stores/animationStore.js'
import { extractTweenableProps } from '../../composables/useDrawing.js'

const grid = uxState.grid
const primaryId = computed(() => uxState.selectedIds[0] ?? null)
const el = computed(() => primaryId.value ? dataState.elements[primaryId.value] : null)
const isMultiSelect = computed(() => uxState.selectedIds.length > 1)
const isGrouped = computed(() => !!el.value?.groupId)
const groupInfo = computed(() => el.value?.groupId ? dataState.groups[el.value.groupId] : null)

const renameWarning = ref('')
const groupRenameWarning = ref('')
let _warningTimer = null
let _groupWarningTimer = null

function showWarning(ref_, msg) {
  ref_.value = msg
  clearTimeout(_warningTimer)
  _warningTimer = setTimeout(() => { ref_.value = '' }, 3000)
}

function handleRename(desired) {
  if (!primaryId.value) return
  const actual = renameElement(primaryId.value, desired)
  if (actual !== desired.trim()) showWarning(renameWarning, `Renamed to "${actual}"`)
  else renameWarning.value = ''
}

function handleGroupRename(desired) {
  if (!el.value?.groupId) return
  const actual = setGroupName(el.value.groupId, desired)
  if (actual !== desired.trim()) showWarning(groupRenameWarning, `Renamed to "${actual}"`)
  else groupRenameWarning.value = ''
}
const project = computed(() => dataState.project)
const canvasZoom = computed(() => uxState.canvasZoom)
const currentFrame = computed(() => Math.round(uxState.currentFrame))
const effectiveBg = computed(() => uxState.sessionBg || project.value.background)

function round(v) { return typeof v === 'number' ? Math.round(v * 10) / 10 : v }

function patch(p) {
  if (!primaryId.value) return
  updateElement(primaryId.value, p)
  syncProxyToElement(primaryId.value)
}

function patchProject(p) {
  updateProject(p)
}

function setBackground(color) {
  uxState.sessionBg = color
  updateProject({ background: color })
}

function setZoom(v) {
  uxState.canvasZoom = v
}

function fitToScreen() {
  // Estimate available canvas area (minus padding)
  const containerW = window.innerWidth - 240 - 80  // minus props panel and padding
  const containerH = window.innerHeight - 48 - 220 - 80  // minus toolbar, timeline, padding
  const scaleW = containerW / project.value.canvasWidth
  const scaleH = containerH / project.value.canvasHeight
  uxState.canvasZoom = Math.min(1, Math.min(scaleW, scaleH))
}

function addKf() {
  if (!el.value) return
  const props = extractTweenableProps(el.value)
  addKeyframe(el.value.id, currentFrame.value, props)
}

function bringForward(id) { bringFwd(id) }
function sendBackward(id) { sendBwd(id) }
function group() { groupElements(uxState.selectedIds) }
function ungroup() { ungroupElements(uxState.selectedIds) }

const sizePresets = [
  { label: '16:9 HD', w: 1280, h: 720 },
  { label: '16:9 FHD', w: 1920, h: 1080 },
  { label: '4:3', w: 1024, h: 768 },
  { label: '1:1', w: 1080, h: 1080 },
  { label: '9:16', w: 720, h: 1280 },
]

const toolHints = [
  { key: 'V', label: 'Select' },
  { key: 'R', label: 'Rect' },
  { key: 'E', label: 'Ellipse' },
  { key: 'L', label: 'Line' },
  { key: 'A', label: 'Arrow' },
  { key: 'T', label: 'Text' },
  { key: 'P', label: 'Path' },
]
</script>

<style scoped>
.properties-panel {
  grid-area: properties;
  background: var(--surface);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.panel-title {
  padding: 10px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
}

.name-section {
  gap: 4px;
}

.name-input {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 6px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}

.name-input:hover {
  border-color: var(--border);
  background: var(--surface-2);
}

.name-input:focus {
  border-color: var(--accent);
  background: var(--surface-2);
}

.rename-warning {
  font-size: 10px;
  color: #f0a443;
  padding: 0 2px;
}

.prop-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prop-row.column {
  flex-direction: column;
  align-items: stretch;
}

.prop-row label {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 44px;
}

.prop-row input[type="number"],
.prop-row textarea {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  padding: 3px 6px;
  outline: none;
}

.prop-row input[type="number"]:focus,
.prop-row textarea:focus {
  border-color: var(--accent);
}

.prop-row input[type="color"] {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  background: none;
}

.prop-row input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
}

.color-hex {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
  min-width: 48px;
}

.layer-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 20px;
}

.mini-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.mini-btn:hover { border-color: var(--accent); }

.add-kf-btn {
  width: 100%;
  padding: 7px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  transition: background 0.1s;
}

.add-kf-btn:hover { background: var(--accent); color: #fff; }

.panel-empty {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-empty p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.prop-row input[type="text"] {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  padding: 3px 6px;
  outline: none;
}

.prop-row input[type="text"]:focus {
  border-color: var(--accent);
}

.preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.preset-btn {
  padding: 3px 7px;
  font-size: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.1s, border-color 0.1s;
}

.preset-btn:hover { color: var(--text); border-color: var(--text-muted); }
.preset-btn.active { color: var(--accent); border-color: var(--accent); }

.toggle-label {
  font-size: 11px;
  color: var(--text-muted);
}

.hint-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hint {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

kbd {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: monospace;
  color: var(--text);
}
</style>
