<template>
  <div class="storyboard-wrap" @wheel.ctrl.prevent="onCtrlWheel">
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
          <marker id="sb-arrowhead" markerWidth="10" markerHeight="7"
                  refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
          <marker id="sb-arrowhead-start" markerWidth="10" markerHeight="7"
                  refX="1" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
        </defs>

        <!-- Scene cards — click enters the scene directly -->
        <g v-for="(scene, i) in scenes" :key="scene.id"
           :transform="`translate(${slotX(i)}, ${slotY(i)})`"
           @mouseenter="hoveredSceneId = scene.id"
           @mouseleave="hoveredSceneId = null">
          <SceneThumbnail
            :scene="scene"
            :selected="scene.id === activeSceneId"
            @click="onEnterScene(scene.id)"
          />
          <!-- Delete icon — appears on hover, upper-right corner -->
          <g v-if="hoveredSceneId === scene.id"
             :transform="`translate(${cw - 72}, 72)`"
             @click.stop="onDeleteScene(scene)"
             style="cursor: pointer">
            <circle r="60" fill="rgba(210,40,60,0.92)" />
            <text text-anchor="middle" dominant-baseline="central"
                  font-size="64" fill="white"
                  font-family="Inter, system-ui, sans-serif" pointer-events="none">✕</text>
          </g>
        </g>

        <!-- New Scene card at the end -->
        <g :transform="`translate(${slotX(scenes.length)}, ${slotY(scenes.length)})`"
           @click="onNewScene" style="cursor: pointer">
          <rect :width="cw" :height="ch" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"
                stroke-width="2" stroke-dasharray="8 4" rx="2" />
          <text :x="cw/2" :y="ch/2 - 12" text-anchor="middle" font-size="48" fill="rgba(255,255,255,0.25)"
                font-family="Inter, system-ui, sans-serif">+</text>
          <text :x="cw/2" :y="ch/2 + 28" text-anchor="middle" font-size="20" fill="rgba(255,255,255,0.3)"
                font-family="Inter, system-ui, sans-serif">New scene</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState from '../../stores/dataState.js'
import { enterSceneEdit, backfillSequences, deleteScene, sceneLabel } from '../../stores/sceneStore.js'
import SceneThumbnail from './SceneThumbnail.vue'

const PADDING  = 60
const GAP      = 80
const LABEL_H  = 56
const MAX_COLS = 6

const cw = computed(() => dataState.project.canvasWidth)
const ch = computed(() => dataState.project.canvasHeight)
const scenes = computed(() =>
  [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
)
const activeSceneId = computed(() => uxState.activeSceneId)

const cols = computed(() => Math.min(Math.max(scenes.value.length + 1, 1), MAX_COLS))
const rows = computed(() => Math.ceil((scenes.value.length + 1) / MAX_COLS))

function slotCol(i) { return i % MAX_COLS }
function slotRow(i) { return Math.floor(i / MAX_COLS) }
function slotX(i)   { return PADDING + slotCol(i) * (cw.value + GAP) }
function slotY(i)   { return PADDING + slotRow(i) * (ch.value + GAP + LABEL_H) }

const totalW = computed(() => PADDING + cols.value * (cw.value + GAP) - GAP + PADDING)
const totalH = computed(() => PADDING + rows.value * (ch.value + GAP + LABEL_H) - GAP + PADDING)

const panX = ref(0)
const panY = ref(0)
const zoom = computed(() => uxState.storyboardZoom)
const viewBox = computed(() => `${panX.value} ${panY.value} ${totalW.value / zoom.value} ${totalH.value / zoom.value}`)

const wrapRef = ref(null)

function fitToView() {
  uxState.storyboardZoom = 1
  panX.value = 0
  panY.value = 0
}

onMounted(() => { backfillSequences(); nextTick(fitToView) })

const hoveredSceneId = ref(null)
const isPanning = ref(false)
let _panStart = null
let _panOrigin = null

function onPanStart(e) {
  if (e.target !== wrapRef.value && e.target.tagName !== 'svg') return
  hoveredSceneId.value = null
  isPanning.value = true
  _panStart = { x: e.clientX, y: e.clientY }
  _panOrigin = { x: panX.value, y: panY.value }
}
function onPanMove(e) {
  if (!isPanning.value || !_panStart) return
  panX.value = _panOrigin.x - (e.clientX - _panStart.x) / zoom.value
  panY.value = _panOrigin.y - (e.clientY - _panStart.y) / zoom.value
}
function onPanEnd() { isPanning.value = false; _panStart = null }

function onCtrlWheel(e) {
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  uxState.storyboardZoom = Math.max(0.05, Math.min(1, uxState.storyboardZoom + delta))
}

function onEnterScene(id) { enterSceneEdit(id) }

function onDeleteScene(scene) {
  const behavior = uxState.deleteBehavior
  if (behavior === 'safe') {
    if (!window.confirm(`Delete "${sceneLabel(scene)}"?`)) return
  }
  deleteScene(scene.id)
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
