<template>
  <div
    class="app-layout"
    :style="{
      '--props-w': uxState.propsPanelWidth + 'px',
      'grid-template-rows': gridRows,
    }"
  >
    <Toolbar />
    <StoryboardCanvas v-if="storyboardMode" />
    <SvgCanvas v-else />
    <div
      class="panel-resizer"
      :class="{ dragging: resizing }"
      @mousedown.prevent="onResizerDown"
    />
    <PropertiesPanel />
    <TimelinePanel />
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import Toolbar from './Toolbar.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SvgCanvas from '../canvas/SvgCanvas.vue'
import StoryboardCanvas from '../canvas/StoryboardCanvas.vue'
import TimelinePanel from '../timeline/TimelinePanel.vue'
import uxState from '../../stores/uxState.js'

const TOGGLE_H = 28

const storyboardMode = computed(() => uxState.storyboardMode)

const gridRows = computed(() => {
  const tlH = uxState.timelineOpen
    ? (uxState.timelinePanelHeight + TOGGLE_H) + 'px'
    : TOGGLE_H + 'px'
  return `var(--toolbar-h) 1fr ${tlH}`
})

// ── Panel resize ──────────────────────────────────────────────────────────────
const resizing = ref(false)
let _startX = 0
let _startWidth = 0

function onResizerDown(e) {
  resizing.value = true
  _startX = e.clientX
  _startWidth = uxState.propsPanelWidth
  document.addEventListener('mousemove', onDocMove)
  document.addEventListener('mouseup', onDocUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDocMove(e) {
  const dx = _startX - e.clientX
  uxState.propsPanelWidth = Math.max(160, Math.min(600, _startWidth + dx))
}

function onDocUp() {
  resizing.value = false
  document.removeEventListener('mousemove', onDocMove)
  document.removeEventListener('mouseup', onDocUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDocMove)
  document.removeEventListener('mouseup', onDocUp)
})
</script>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 1fr 4px var(--props-w);
  grid-template-areas:
    "toolbar  toolbar   toolbar"
    "canvas   resizer   properties"
    "timeline timeline  timeline";
  height: 100%;
  width: 100%;
  overflow: hidden;
  transition: grid-template-rows 0.25s ease;
}

.panel-resizer {
  grid-area: resizer;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.15s;
}

.panel-resizer:hover,
.panel-resizer.dragging {
  background: #4a90e2;
}

@media (max-width: 640px) {
  .app-layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      "toolbar"
      "canvas"
      "timeline";
  }
  .panel-resizer { display: none }
}
</style>
