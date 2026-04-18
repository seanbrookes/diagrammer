<template>
  <div class="canvas-container" @wheel.ctrl.prevent="onCtrlWheel">
    <svg
      id="main-canvas"
      ref="svgRef"
      :width="project.canvasWidth * canvasZoom"
      :height="project.canvasHeight * canvasZoom"
      :viewBox="`0 0 ${project.canvasWidth} ${project.canvasHeight}`"
      :style="{
        background: project.background,
        cursor: cursorStyle,
        display: 'block',
      }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @dblclick="onDblClick"
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
      </defs>

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

      <!-- Text editor overlay -->
      <TextEditor />
    </svg>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import dataState from '../../stores/dataState.js'
import uxState from '../../stores/uxState.js'
import { sortedElementProxies } from '../../stores/animationStore.js'
import { useDrawing } from '../../composables/useDrawing.js'
import { useSelection, marquee } from '../../composables/useSelection.js'
import ElementRenderer from './ElementRenderer.vue'
import SelectionOverlay from './SelectionOverlay.vue'
import TextEditor from './TextEditor.vue'

const svgRef = ref(null)

const project = computed(() => dataState.project)
const canvasZoom = computed(() => uxState.canvasZoom)
const selectedIds = computed(() => uxState.selectedIds)
const activeTool = computed(() => uxState.activeTool)

const { onMouseDown: drawDown, onMouseMove: drawMove, onMouseUp: drawUp, previewElement } = useDrawing()
const { onMouseDown: selectDown, onMouseMove: selectMove, onMouseUp: selectUp } = useSelection()

const DRAWING_TOOLS = ['rect', 'ellipse', 'line', 'arrow', 'text', 'path']

const cursorStyle = computed(() => {
  if (DRAWING_TOOLS.includes(activeTool.value)) return 'crosshair'
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
  if (DRAWING_TOOLS.includes(activeTool.value)) {
    drawDown(pt)
  } else {
    // Route to selection: pass the native target so it can read data-element-id / data-handle
    selectDown(pt, event.target)
  }
}

function onMouseMove(event) {
  const pt = getSvgPoint(event)
  if (uxState.drawState.active) {
    drawMove(pt)
  } else {
    selectMove(pt)
  }
}

function onMouseUp() {
  if (uxState.drawState.active) {
    drawUp()
  } else {
    selectUp()
  }
}

function onMouseLeave() {
  if (uxState.drawState.active) drawUp()
  if (uxState.dragState.active) selectUp()
}

function onCtrlWheel(event) {
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  uxState.canvasZoom = Math.max(0.1, Math.min(4, uxState.canvasZoom + delta))
}

function onDblClick(event) {
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
}

/* When canvas is larger than container, start from top-left so it's still scrollable */
.canvas-container > svg {
  flex-shrink: 0;
  box-shadow: 0 4px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
  border-radius: 2px;
}
</style>
