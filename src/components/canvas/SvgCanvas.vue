<template>
  <div class="canvas-container" ref="containerRef" @wheel.ctrl.prevent="onCtrlWheel">
    <!-- Scene nav: prev -->
    <div v-if="prevScene" class="scene-nav scene-nav-left" @click="goToScene(prevScene.id)">
      <span class="scene-nav-arrow">←</span>
      <span class="scene-nav-seq">#{{ prevScene.sequence }}</span>
      <span class="scene-nav-name">{{ sceneLabel(prevScene) }}</span>
    </div>

    <!-- Scene nav: next -->
    <div v-if="nextScene" class="scene-nav scene-nav-right" @click="goToScene(nextScene.id)">
      <span class="scene-nav-name">{{ sceneLabel(nextScene) }}</span>
      <span class="scene-nav-seq">#{{ nextScene.sequence }}</span>
      <span class="scene-nav-arrow">→</span>
    </div>

    <!-- Scene progress indicator -->
    <div v-if="sortedScenes.length" class="scene-progress">
      <div
        v-for="scene in sortedScenes"
        :key="scene.id"
        class="scene-pip"
        :class="{ active: scene.id === activeSceneId }"
        :title="sceneLabel(scene)"
        @click="goToScene(scene.id)"
      />
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
        touchAction: 'none',
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

      <!-- Selection overlays (resize handles) — hidden while text editor is active -->
      <SelectionOverlay
        v-for="id in selectedIds.filter(id => id !== uxState.editingTextId)"
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

      <!-- Alignment guides -->
      <g v-if="uxState.alignGuides.length" pointer-events="none">
        <line
          v-for="(g, i) in uxState.alignGuides" :key="i"
          :x1="g.axis === 'x' ? g.pos : -9999"
          :y1="g.axis === 'y' ? g.pos : -9999"
          :x2="g.axis === 'x' ? g.pos : project.canvasWidth + 9999"
          :y2="g.axis === 'y' ? g.pos : project.canvasHeight + 9999"
          stroke="#f05252"
          :stroke-width="1 / canvasZoom"
          stroke-dasharray="none"
          opacity="0.85"
        />
      </g>

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
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue'
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
import { recordSnapshot } from '../../composables/useHistory.js'
import { clearSelection } from '../../stores/uxState.js'
import { snapIndicator } from '../../utils/snapPoints.js'
import { useSnapshot, snapshotRect } from '../../composables/useSnapshot.js'
import { exitSceneEdit, enterSceneEdit, captureToast, sceneLabel } from '../../stores/sceneStore.js'

const svgRef = ref(null)
const containerRef = ref(null)
const ctxMenu = reactive({ visible: false, x: 0, y: 0 })

// ── Shift+drag canvas pan ──────────────────────────────────────────────────────
const panning = ref(false)
let _panStartX = 0, _panStartY = 0
let _panScrollLeft = 0, _panScrollTop = 0

function isCanvasBackground(target) {
  return !target?.closest?.('[data-id]') &&
         !target?.dataset?.handle &&
         !target?.dataset?.penHandle
}

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
  recordSnapshot()
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

// ── Touch support ─────────────────────────────────────────────────────────────
// Normalises touch events into the same shape as mouse events and routes them
// through the existing handlers so composables need no changes.

let _lastTouchEndTime = 0
let _pinchStartDist = 0
let _pinchStartZoom = 0

function isFormTarget(el) {
  const tag = el?.tagName
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'
}

function onTouchStart(event) {
  // Let native focus/keyboard handling work for form elements
  if (isFormTarget(event.target)) return
  event.preventDefault()

  if (event.touches.length === 2) {
    const t0 = event.touches[0], t1 = event.touches[1]
    _pinchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
    _pinchStartZoom = uxState.canvasZoom
    return
  }

  if (event.touches.length !== 1) return
  const touch = event.touches[0]

  // Double-tap → dblclick equivalent
  if (Date.now() - _lastTouchEndTime < 300) {
    _lastTouchEndTime = 0
    if (activeTool.value === 'pen' || penState.active) {
      penDblClick()
    } else {
      const tgt = document.elementFromPoint(touch.clientX, touch.clientY)
      const elementId = tgt?.closest?.('[data-id]')?.dataset?.id
      if (elementId && dataState.elements[elementId]?.type === 'text') {
        uxState.editingTextId = elementId
      }
    }
    return
  }

  const target = document.elementFromPoint(touch.clientX, touch.clientY) ?? svgRef.value
  target._shiftKey = false
  onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, target, shiftKey: false })
}

function onTouchMove(event) {
  if (isFormTarget(event.target)) return
  event.preventDefault()

  if (event.touches.length === 2) {
    const t0 = event.touches[0], t1 = event.touches[1]
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
    uxState.canvasZoom = Math.max(0.1, Math.min(MAX_ZOOM, _pinchStartZoom * (dist / _pinchStartDist)))
    return
  }

  if (event.touches.length !== 1) return
  const touch = event.touches[0]
  onMouseMove({ clientX: touch.clientX, clientY: touch.clientY, shiftKey: false })
}

function onTouchEnd(event) {
  if (isFormTarget(event.target)) return
  event.preventDefault()
  _lastTouchEndTime = Date.now()
  onMouseUp()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutsideMenu)
  const svg = svgRef.value
  svg.addEventListener('touchstart',  onTouchStart, { passive: false })
  svg.addEventListener('touchmove',   onTouchMove,  { passive: false })
  svg.addEventListener('touchend',    onTouchEnd,   { passive: false })
  svg.addEventListener('touchcancel', onTouchEnd,   { passive: false })
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutsideMenu)
  const svg = svgRef.value
  if (svg) {
    svg.removeEventListener('touchstart',  onTouchStart)
    svg.removeEventListener('touchmove',   onTouchMove)
    svg.removeEventListener('touchend',    onTouchEnd)
    svg.removeEventListener('touchcancel', onTouchEnd)
  }
})

const project = computed(() => dataState.project)
const canvasZoom = computed(() => uxState.canvasZoom)
const selectedIds = computed(() => uxState.selectedIds)
const activeTool = computed(() => uxState.activeTool)
const grid = computed(() => uxState.grid)
const activeSceneId = computed(() => uxState.activeSceneId)
const sortedScenes = computed(() => [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)))
const currentSceneIndex = computed(() => sortedScenes.value.findIndex(s => s.id === uxState.activeSceneId))
const prevScene = computed(() => currentSceneIndex.value > 0 ? sortedScenes.value[currentSceneIndex.value - 1] : null)
const nextScene = computed(() => {
  if (!sortedScenes.value.length) return null
  // No active scene → offer the first scene
  if (currentSceneIndex.value < 0) return sortedScenes.value[0]
  if (currentSceneIndex.value < sortedScenes.value.length - 1) return sortedScenes.value[currentSceneIndex.value + 1]
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

// Clear extend-hover indicator when switching away from pen tool
watch(() => uxState.activeTool, tool => {
  if (tool !== 'pen') penState.extendTarget = null
})

const cursorStyle = computed(() => {
  if (DRAWING_TOOLS.includes(activeTool.value) || activeTool.value === 'pen' || activeTool.value === 'snapshot') return 'crosshair'
  if (panning.value || uxState.dragState.active) return 'grabbing'
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
    // Shift+drag on empty canvas → pan
    if (event.shiftKey && isCanvasBackground(target)) {
      panning.value = true
      _panStartX    = event.clientX
      _panStartY    = event.clientY
      _panScrollLeft = containerRef.value?.scrollLeft ?? 0
      _panScrollTop  = containerRef.value?.scrollTop  ?? 0
      return
    }
    target._shiftKey = event.shiftKey
    target._ctrlKey  = event.ctrlKey || event.metaKey
    target._altKey   = event.altKey
    selectDown(pt, target)
  }
}

function onMouseMove(event) {
  if (panning.value) {
    const c = containerRef.value
    if (c) {
      c.scrollLeft = _panScrollLeft - (event.clientX - _panStartX)
      c.scrollTop  = _panScrollTop  - (event.clientY - _panStartY)
    }
    return
  }
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
  if (panning.value) { panning.value = false; return }
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
  if (panning.value) { panning.value = false; return }
  if (snapshotRect.active) snapLeave()
  if (uxState.drawState.active) drawUp()
  if (uxState.dragState.active) selectUp()
  // Don't cancel pen on mouseleave — user may move back onto canvas
}

const MAX_ZOOM = 20

async function onCtrlWheel(event) {
  const c = containerRef.value
  const svg = svgRef.value
  if (!c || !svg) return

  const dir = uxState.invertScrollZoom ? -1 : 1
  const step = uxState.canvasZoom < 2 ? 0.1 : uxState.canvasZoom < 5 ? 0.25 : 0.5
  const delta = (event.deltaY > 0 ? -step : step) * dir
  const next = uxState.canvasZoom + delta

  if (next < 0.1 && dataState.scenes.length > 0) {
    uxState.storyboardMode = true
    return
  }

  // Record where the cursor sits within the SVG (as a 0–1 fraction) and
  // where it sits within the container viewport, before the zoom changes.
  const svgRect = svg.getBoundingClientRect()
  const cRect   = c.getBoundingClientRect()
  const fracX   = (event.clientX - svgRect.left) / svgRect.width
  const fracY   = (event.clientY - svgRect.top)  / svgRect.height
  const cursorX = event.clientX - cRect.left
  const cursorY = event.clientY - cRect.top

  uxState.canvasZoom = Math.max(0.1, Math.min(MAX_ZOOM, next))

  // After Vue re-renders the resized SVG, shift the scroll so the same SVG
  // point stays under the cursor.
  await nextTick()
  const newSvgRect = svg.getBoundingClientRect()
  c.scrollLeft += (newSvgRect.left + fracX * newSvgRect.width)  - (cRect.left + cursorX)
  c.scrollTop  += (newSvgRect.top  + fracY * newSvgRect.height) - (cRect.top  + cursorY)
}

function onDblClick(event) {
  if (activeTool.value === 'pen' || penState.active) {
    penDblClick()
    return
  }
  const elementId = event.target?.closest?.('[data-id]')?.dataset?.id
  // Fallback: thin pen strokes are hard to hit precisely — if a single pen element
  // is already selected, any double-click enters edit mode for it.
  const resolvedId = elementId ?? (
    uxState.selectedIds.length === 1 &&
    dataState.elements[uxState.selectedIds[0]]?.type === 'pen'
      ? uxState.selectedIds[0]
      : null
  )
  if (!resolvedId) return
  const el = dataState.elements[resolvedId]
  if (el?.type === 'text') {
    uxState.editingTextId = resolvedId
  } else if (el?.type === 'pen') {
    uxState.editingPenId = resolvedId
    if (!uxState.selectedIds.includes(resolvedId)) uxState.selectedIds = [resolvedId]
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

/* Scene nav buttons — top corners, always visible */
.scene-nav {
  position: absolute;
  top: 16px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  user-select: none;
  max-width: 220px;
}
.scene-nav:hover {
  background: var(--surface-2);
  border-color: #4a90e2;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
}
.scene-nav-left  { left: 16px; }
.scene-nav-right { right: 16px; }

.scene-nav-arrow {
  font-size: 18px;
  color: #4a90e2;
  line-height: 1;
  flex-shrink: 0;
}
.scene-nav-seq {
  font-size: 11px;
  font-weight: 700;
  color: #6db3f2;
  flex-shrink: 0;
}
.scene-nav-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Scene progress indicator */
.scene-progress {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: calc(100% - 320px);
  overflow: hidden;
  pointer-events: all;
}
.scene-pip {
  width: 22px;
  height: 14px;
  border-radius: 2px;
  border: 1.5px solid rgba(180,180,180,0.35);
  background: transparent;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.scene-pip.active {
  background: #fff;
  border-color: #fff;
}
.scene-pip:not(.active):hover {
  border-color: rgba(255,255,255,0.65);
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

@media (max-width: 640px) {
  .canvas-container {
    padding: 8px;
  }
}
</style>
