<template>
  <div class="canvas-container" @wheel.ctrl.prevent="onCtrlWheel">
    <!-- Carousel: prev scene -->
    <div v-if="prevScene" class="scene-nav scene-nav-left" @click="goToScene(prevScene.id)">
      <div class="scene-nav-inner">
        <span class="scene-nav-arrow">‹</span>
        <span class="scene-nav-label"><span class="scene-nav-seq">#{{ prevScene.sequence }}</span> {{ sceneLabel(prevScene) }}</span>
      </div>
    </div>

    <!-- Carousel: next scene -->
    <div v-if="nextScene" class="scene-nav scene-nav-right" @click="goToScene(nextScene.id)">
      <div class="scene-nav-inner">
        <span class="scene-nav-label"><span class="scene-nav-seq">#{{ nextScene.sequence }}</span> {{ sceneLabel(nextScene) }}</span>
        <span class="scene-nav-arrow">›</span>
      </div>
    </div>

    <!-- Capture toast -->
    <Transition name="toast">
      <div v-if="captureToast.visible" class="scene-toast">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/>
          <rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/>
        </svg>
        <span>Scene captured: <strong>{{ captureToast.label }}</strong></span>
      </div>
    </Transition>
    <svg
      id="main-canvas"
      ref="svgRef"
      :width="project.canvasWidth * canvasZoom"
      :height="project.canvasHeight * canvasZoom"
      :viewBox="`0 0 ${project.canvasWidth} ${project.canvasHeight}`"
      :style="{
        background: effectiveBg,
        cursor: cursorStyle,
        display: 'block',
      }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @dblclick="onDblClick"
      @contextmenu.prevent="onContextMenu"
    >
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7"
                refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
        </marker>
        <marker id="arrowhead-start" markerWidth="10" markerHeight="7"
                refX="1" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
        </marker>
        <pattern
          id="canvas-grid"
          :width="grid.spacing" :height="grid.spacing"
          patternUnits="userSpaceOnUse"
        >
          <path
            :d="`M ${grid.spacing} 0 L 0 0 0 ${grid.spacing}`"
            fill="none" :stroke="gridColor" stroke-width="0.5"
          />
        </pattern>
      </defs>

      <!-- Grid overlay -->
      <rect
        v-if="grid.visible"
        :width="project.canvasWidth" :height="project.canvasHeight"
        fill="url(#canvas-grid)" pointer-events="none"
      />

      <!-- Elements rendered from GSAP-driven proxies -->
      <ElementRenderer
        v-for="proxy in sortedElementProxies"
        :key="proxy.id"
        :el="proxy"
      />

      <!-- Ghost preview during drawing -->
      <ElementRenderer
        v-if="previewElement"
        :el="{ ...previewElement, id: '__preview__' }"
        style="pointer-events: none; opacity: 0.7"
      />

      <!-- Selection overlays (resize handles) -->
      <SelectionOverlay
        v-for="id in selectedIds"
        :key="id"
        :elementId="id"
      />

      <!-- Marquee selection rect -->
      <rect
        v-if="marquee.active"
        :x="marquee.x" :y="marquee.y"
        :width="marquee.width" :height="marquee.height"
        fill="rgba(74,144,226,0.1)" stroke="#4a90e2"
        stroke-width="1" stroke-dasharray="4 2"
        pointer-events="none"
      />

      <!-- Pen tool live preview -->
      <PenPreview />

      <!-- Snapshot selection rect -->
      <rect
        v-if="snapshotRect.active"
        :x="snapshotRect.x" :y="snapshotRect.y"
        :width="snapshotRect.width" :height="snapshotRect.height"
        fill="rgba(255,200,0,0.08)" stroke="#f59e0b"
        stroke-width="1" stroke-dasharray="5 3"
        pointer-events="none"
      />

      <!-- Point snap indicator -->
      <g v-if="snapIndicator.active" pointer-events="none">
        <circle :cx="snapIndicator.x" :cy="snapIndicator.y" r="7"
                fill="none" stroke="#4a90e2" stroke-width="1" opacity="0.9" />
        <circle :cx="snapIndicator.x" :cy="snapIndicator.y" r="1.5"
                fill="#4a90e2" opacity="0.9" />
      </g>

      <!-- Text editor overlay -->
      <TextEditor />
    </svg>

    <!-- Context menu (teleports to body, outside SVG) -->
    <ContextMenu
      v-if="ctxMenu.visible"
      :x="ctxMenu.x" :y="ctxMenu.y"
      @action="handleContextAction"
      @close="closeContextMenu"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import dataState from '../../stores/dataState.js'
import {
  bringToFront, bringForward, sendBackward, sendToBack,
  flipHorizontal, flipVertical,
  groupElements, ungroupElements,
  removeElement,
} from '../../stores/dataState.js'
import uxState from '../../stores/uxState.js'
import { sortedElementProxies } from '../../stores/animationStore.js'
import { useDrawing } from '../../composables/useDrawing.js'
import { useSelection, marquee } from '../../composables/useSelection.js'
import { usePen, penState } from '../../composables/usePen.js'
import ElementRenderer from './ElementRenderer.vue'
import SelectionOverlay from './SelectionOverlay.vue'
import PenPreview from './PenPreview.vue'
import ContextMenu from './ContextMenu.vue'
import TextEditor from './TextEditor.vue'
import { syncProxyToElement, removeProxy } from '../../stores/animationStore.js'
import { clearSelection } from '../../stores/uxState.js'
import { snapIndicator } from '../../utils/snapPoints.js'
import { useSnapshot, snapshotRect } from '../../composables/useSnapshot.js'
import { exitSceneEdit, enterSceneEdit, captureToast, sceneLabel } from '../../stores/sceneStore.js'

const svgRef = ref(null)
const ctxMenu = reactive({ visible: false, x: 0, y: 0 })

function onContextMenu(event) {
  if (!selectedIds.value.length) return
  ctxMenu.x = event.clientX
  ctxMenu.y = event.clientY
  ctxMenu.visible = true
}

function closeContextMenu() { ctxMenu.visible = false }

function handleContextAction(action) {
  const ids = uxState.selectedIds
  const primary = ids[0]
  switch (action) {
    case 'flipH':        ids.forEach(id => { flipHorizontal(id); syncProxyToElement(id) }); break
    case 'flipV':        ids.forEach(id => { flipVertical(id);   syncProxyToElement(id) }); break
    case 'bringToFront': bringToFront(primary); break
    case 'bringForward': bringForward(primary); break
    case 'sendBackward': sendBackward(primary); break
    case 'sendToBack':   sendToBack(primary);   break
    case 'group':        groupElements(ids);    break
    case 'ungroup':      ungroupElements(ids);  break
    case 'delete':
      ids.forEach(id => { removeElement(id); removeProxy(id) })
      clearSelection()
      break
  }
}

function onClickOutsideMenu(e) {
  if (ctxMenu.visible) closeContextMenu()
}

onMounted(() => document.addEventListener('mousedown', onClickOutsideMenu))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutsideMenu))

const project = computed(() => dataState.project)
const canvasZoom = computed(() => uxState.canvasZoom)
const selectedIds = computed(() => uxState.selectedIds)
const activeTool = computed(() => uxState.activeTool)
const grid = computed(() => uxState.grid)
const activeSceneId = computed(() => uxState.activeSceneId)
const currentSceneIndex = computed(() => dataState.scenes.findIndex(s => s.id === uxState.activeSceneId))
const prevScene = computed(() => currentSceneIndex.value > 0 ? dataState.scenes[currentSceneIndex.value - 1] : null)
const nextScene = computed(() => {
  if (!dataState.scenes.length) return null
  // No active scene → offer the first scene
  if (currentSceneIndex.value < 0) return dataState.scenes[0]
  if (currentSceneIndex.value < dataState.scenes.length - 1) return dataState.scenes[currentSceneIndex.value + 1]
  return null
})

function goToScene(id) {
  if (id === uxState.activeSceneId) return
  if (uxState.activeSceneId) exitSceneEdit()
  enterSceneEdit(id)
}

const activeScene = computed(() => dataState.scenes.find(s => s.id === uxState.activeSceneId) ?? null)
const effectiveBg = computed(() =>
  activeScene.value?.background ||
  project.value.background
)

function hexLuminance(hex) {
  const h = hex.replace('#', '')
  if (h.length < 6) return 0
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

const gridColor = computed(() =>
  hexLuminance(effectiveBg.value) > 0.5
    ? 'rgba(0,0,0,0.2)'
    : 'rgba(255,255,255,0.2)'
)

const { onMouseDown: drawDown, onMouseMove: drawMove, onMouseUp: drawUp, previewElement } = useDrawing()
const { onMouseDown: selectDown, onMouseMove: selectMove, onMouseUp: selectUp } = useSelection()
const { onMouseDown: penDown, onMouseMove: penMove, onMouseUp: penUp, onDblClick: penDblClick } = usePen()
const { onMouseDown: snapDown, onMouseMove: snapMove, onMouseUp: snapUp, onMouseLeave: snapLeave } = useSnapshot(svgRef)

const DRAWING_TOOLS = ['rect', 'ellipse', 'line', 'arrow', 'text', 'path']

const cursorStyle = computed(() => {
  if (DRAWING_TOOLS.includes(activeTool.value) || activeTool.value === 'pen' || activeTool.value === 'snapshot') return 'crosshair'
  if (uxState.dragState.active) return 'grabbing'
  return 'default'
})

function getSvgPoint(event) {
  const svg = svgRef.value
  const rect = svg.getBoundingClientRect()
  // viewBox / displayed-size ratio handles zoom and any internal SVG scaling
  const scaleX = svg.viewBox.baseVal.width / rect.width
  const scaleY = svg.viewBox.baseVal.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

function onMouseDown(event) {
  const pt = getSvgPoint(event)
  if (activeTool.value === 'snapshot') {
    snapDown(pt)
  } else if (activeTool.value === 'pen') {
    penDown(pt)
  } else if (DRAWING_TOOLS.includes(activeTool.value)) {
    drawDown(pt)
  } else {
    const target = event.target
    target._shiftKey = event.shiftKey
    selectDown(pt, target)
  }
}

function onMouseMove(event) {
  const pt = getSvgPoint(event)
  if (activeTool.value === 'snapshot' || snapshotRect.active) {
    snapMove(pt)
  } else if (activeTool.value === 'pen' || penState.active) {
    penMove(pt)
  } else if (uxState.drawState.active) {
    drawMove(pt, event.shiftKey)
  } else {
    selectMove(pt, event.shiftKey)
  }
}

function onMouseUp() {
  if (snapshotRect.active) {
    snapUp()
  } else if (penState.active) {
    penUp()
  } else if (uxState.drawState.active) {
    drawUp()
  } else {
    selectUp()
  }
}

function onMouseLeave() {
  if (snapshotRect.active) snapLeave()
  if (uxState.drawState.active) drawUp()
  if (uxState.dragState.active) selectUp()
  // Don't cancel pen on mouseleave — user may move back onto canvas
}

function onCtrlWheel(event) {
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const next = uxState.canvasZoom + delta
  if (next < 0.1 && dataState.scenes.length > 0) {
    uxState.storyboardMode = true
    return
  }
  uxState.canvasZoom = Math.max(0.1, Math.min(4, next))
}

function onDblClick(event) {
  if (activeTool.value === 'pen' || penState.active) {
    penDblClick()
    return
  }
  const elementId = event.target?.dataset?.elementId
  if (elementId && dataState.elements[elementId]?.type === 'text') {
    uxState.editingTextId = elementId
  }
}
</script>

<style scoped>
.canvas-container {
  grid-area: canvas;
  overflow: auto;
  background: #111827;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.scene-nav-seq {
  font-size: 10px;
  opacity: 0.7;
}

/* Carousel nav arrows */
.scene-nav {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 56px;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
  pointer-events: all;
}
.scene-nav:hover { opacity: 1 }
.scene-nav-left {
  left: 0;
  background: linear-gradient(to right, rgba(0,0,0,0.45), transparent);
}
.scene-nav-right {
  right: 0;
  background: linear-gradient(to left, rgba(0,0,0,0.45), transparent);
}
.scene-nav-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.scene-nav-arrow {
  font-size: 32px;
  color: rgba(255,255,255,0.85);
  line-height: 1;
}
.scene-nav-label {
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  text-align: center;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Capture toast */
.scene-toast {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(20, 30, 50, 0.92);
  border: 1px solid rgba(74, 144, 226, 0.4);
  border-radius: 8px;
  font-size: 13px;
  color: #aad0f5;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

.toast-enter-active { transition: opacity 0.25s, transform 0.25s }
.toast-leave-active { transition: opacity 0.4s, transform 0.4s }
.toast-enter-from  { opacity: 0; transform: translateX(-50%) translateY(8px) }
.toast-leave-to    { opacity: 0; transform: translateX(-50%) translateY(4px) }

/* When canvas is larger than container, start from top-left so it's still scrollable */
.canvas-container > svg {
  flex-shrink: 0;
  box-shadow: 0 4px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
  border-radius: 2px;
}
</style>
