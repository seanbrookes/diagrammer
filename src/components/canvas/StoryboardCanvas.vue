<template>
  <div class="storyboard-wrap" @wheel.ctrl.prevent="onCtrlWheel">
    <!-- Toolbar bar -->
    <div class="sb-bar">
      <button class="sb-btn" @click="uxState.storyboardMode = false">← Back</button>
      <span class="sb-title">Storyboard</span>
      <span class="sb-count">{{ scenes.length }} scene{{ scenes.length !== 1 ? 's' : '' }}</span>
      <div class="sb-spacer" />
      <button class="sb-btn" @click="onCapture">+ Capture Scene</button>
      <button class="sb-btn accent" :disabled="!scenes.length" @click="onBake">Bake to Timeline</button>
    </div>

    <!-- Spatial canvas -->
    <div class="sb-canvas-wrap" ref="wrapRef" @mousedown="onPanStart" @mousemove="onPanMove" @mouseup="onPanEnd" @mouseleave="onPanEnd">
      <svg
        class="sb-svg"
        width="100%" height="100%"
        :viewBox="viewBox"
        preserveAspectRatio="xMinYMin meet"
        :style="{ cursor: isPanning ? 'grabbing' : 'grab' }"
      >
        <defs>
          <!-- Arrow marker so thumbnails render arrows correctly -->
          <marker id="sb-arrowhead" markerWidth="10" markerHeight="7"
                  refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
          <marker id="sb-arrowhead-start" markerWidth="10" markerHeight="7"
                  refX="1" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
        </defs>

        <!-- Scene cards -->
        <g v-for="(scene, i) in scenes" :key="scene.id"
           :transform="`translate(${slotX(i)}, ${slotY(i)})`">
          <SceneThumbnail
            :scene="scene"
            :selected="selectedSceneId === scene.id"
            @click="onSelectScene(scene.id)"
            @dblclick="onEnterFromClick(scene.id)"
          />
        </g>

        <!-- "+" add card -->
        <g :transform="`translate(${slotX(scenes.length)}, ${slotY(scenes.length)})`"
           @click="onCapture" style="cursor: pointer">
          <rect :width="cw" :height="ch" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"
                stroke-width="2" stroke-dasharray="8 4" rx="2" />
          <text :x="cw/2" :y="ch/2 - 12" text-anchor="middle" font-size="48" fill="rgba(255,255,255,0.25)"
                font-family="Inter, system-ui, sans-serif">+</text>
          <text :x="cw/2" :y="ch/2 + 28" text-anchor="middle" font-size="20" fill="rgba(255,255,255,0.3)"
                font-family="Inter, system-ui, sans-serif">Capture scene</text>
        </g>
      </svg>
    </div>

    <!-- Selected scene controls panel -->
    <div v-if="selectedScene" class="sb-controls">
      <span class="sb-seq">#{{ selectedScene.sequence }}</span>
      <input class="sb-name-input"
             :value="selectedScene.name ?? ''"
             :placeholder="sceneLabel(selectedScene)"
             @change="updateSceneMeta(selectedScene.id, { name: $event.target.value.trim() || null })"
             @keydown.enter="$event.target.blur()" />
      <label class="sb-field">
        <span>Frame</span>
        <input type="number" min="0" :value="selectedScene.frame"
               @change="updateSceneMeta(selectedScene.id, { frame: +$event.target.value })" />
      </label>
      <button class="sb-btn" @click="onEnterScene(selectedScene.id)">Edit</button>
      <button class="sb-btn" @click="onClone(selectedScene.id)">Clone</button>
      <button class="sb-btn danger" @click="onDelete(selectedScene.id)">Delete</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState from '../../stores/dataState.js'
import { captureScene, updateSceneMeta, deleteScene, enterSceneEdit, cloneScene, bakeScenesToTimeline, backfillSequences, sceneLabel } from '../../stores/sceneStore.js'
import SceneThumbnail from './SceneThumbnail.vue'

const PADDING   = 60   // outer padding
const GAP       = 80   // gap between cards
const LABEL_H   = 56   // height below card for name + frame badge
const MAX_COLS  = 6

const cw = computed(() => dataState.project.canvasWidth)
const ch = computed(() => dataState.project.canvasHeight)
// Sort by sequence so #10 always follows #9, regardless of insertion order
const scenes = computed(() =>
  [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
)

const selectedSceneId = ref(null)
const selectedScene = computed(() => scenes.value.find(s => s.id === selectedSceneId.value) ?? null)

// Grid layout helpers
const cols = computed(() => Math.min(Math.max(scenes.value.length + 1, 1), MAX_COLS))
const rows = computed(() => Math.ceil((scenes.value.length + 1) / MAX_COLS))

function slotCol(i) { return i % MAX_COLS }
function slotRow(i) { return Math.floor(i / MAX_COLS) }
function slotX(i)   { return PADDING + slotCol(i) * (cw.value + GAP) }
function slotY(i)   { return PADDING + slotRow(i) * (ch.value + GAP + LABEL_H) }

const totalW = computed(() => PADDING + cols.value * (cw.value + GAP) - GAP + PADDING)
const totalH = computed(() => PADDING + rows.value * (ch.value + GAP + LABEL_H) - GAP + PADDING)

// ViewBox driven by pan + zoom
const panX = ref(0)
const panY = ref(0)
const zoom = computed(() => uxState.storyboardZoom)

const viewBox = computed(() => {
  const vw = totalW.value / zoom.value
  const vh = totalH.value / zoom.value
  return `${panX.value} ${panY.value} ${vw} ${vh}`
})

const wrapRef = ref(null)

function fitToView() {
  // zoom=1 → viewBox = totalW×totalH, SVG's preserveAspectRatio scales to fill container
  uxState.storyboardZoom = 1
  panX.value = 0
  panY.value = 0
}

onMounted(() => { backfillSequences(); nextTick(fitToView) })

// Pan
const isPanning = ref(false)
let _panStart = null
let _panOrigin = null

function onPanStart(e) {
  if (e.target !== wrapRef.value && e.target.tagName !== 'svg') return
  isPanning.value = true
  _panStart = { x: e.clientX, y: e.clientY }
  _panOrigin = { x: panX.value, y: panY.value }
}
function onPanMove(e) {
  if (!isPanning.value || !_panStart) return
  const dx = (e.clientX - _panStart.x) / zoom.value
  const dy = (e.clientY - _panStart.y) / zoom.value
  panX.value = _panOrigin.x - dx
  panY.value = _panOrigin.y - dy
}
function onPanEnd() {
  isPanning.value = false
  _panStart = null
}

function onCtrlWheel(e) {
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  uxState.storyboardZoom = Math.max(0.05, Math.min(1, uxState.storyboardZoom + delta))
}

function onSelectScene(id) {
  selectedSceneId.value = id
}

function onEnterFromClick(id) {
  onEnterScene(id)
}

function onCapture() {
  const scene = captureScene()
  selectedSceneId.value = scene.id
}

function onEnterScene(id) {
  enterSceneEdit(id)
}

function onClone(id) {
  const clone = cloneScene(id)
  if (clone) selectedSceneId.value = clone.id
}

function onDelete(id) {
  deleteScene(id)
  if (selectedSceneId.value === id) selectedSceneId.value = null
}

function onBake() {
  bakeScenesToTimeline()
  uxState.storyboardMode = false
}
</script>

<style scoped>
.storyboard-wrap {
  grid-area: canvas;
  display: flex;
  flex-direction: column;
  background: #0d0d14;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

.sb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 48px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sb-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.sb-count {
  font-size: 12px;
  color: var(--text-muted, #666);
}

.sb-spacer { flex: 1 }

.sb-btn {
  padding: 5px 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.sb-btn:hover { background: var(--surface-2) }
.sb-btn.accent {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.sb-btn.accent:disabled { opacity: 0.4; cursor: default }
.sb-btn.danger { color: #e94560 }
.sb-btn.danger:hover { background: rgba(233,69,96,0.1) }

.sb-canvas-wrap {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

.sb-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.sb-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.sb-seq {
  font-size: 12px;
  font-weight: 600;
  color: #6db3f2;
  flex-shrink: 0;
}

.sb-name-input {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 4px 8px;
  font-size: 13px;
  width: 160px;
}
.sb-name-input:focus { outline: none; border-color: #4a90e2 }

.sb-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted, #888);
}
.sb-field input[type=number] {
  width: 72px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 4px 6px;
  font-size: 13px;
}
.sb-field input:focus { outline: none; border-color: #4a90e2 }
</style>
