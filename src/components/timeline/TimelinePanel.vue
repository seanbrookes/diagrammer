<template>
  <div class="timeline-panel">
    <div class="timeline-header">
      <button class="timeline-toggle" @click="uxState.timelineOpen = !uxState.timelineOpen">
        {{ uxState.timelineOpen ? '▼ Hide Timeline' : '▲ Timeline' }}
      </button>
    </div>
    <PlaybackControls />

    <div class="timeline-body">
      <!-- Left column: labels -->
      <div class="track-labels" ref="labelsRef">
        <div class="ruler-spacer" />
        <div
          v-for="el in sortedElements"
          :key="el.id"
          class="track-label"
          :class="{ selected: selectedIds.includes(el.id) }"
          @click="selectElement(el.id)"
        >
          <button class="vis-btn" :title="el.visible === false ? 'Show' : 'Hide'"
            @click.stop="toggleVisibility(el.id)">
            {{ el.visible === false ? '○' : '●' }}
          </button>
          <span class="label-text">{{ el.label }}</span>
        </div>
      </div>

      <!-- Right column: ruler + tracks + playhead -->
      <div class="track-area" ref="trackAreaRef" @scroll="onTrackScroll">
        <TimelineRuler ref="rulerRef" />

        <div class="tracks-wrapper" style="position: relative">
          <!-- Playhead line -->
          <div
            class="playhead"
            :style="{ left: playheadX + 'px' }"
          />

          <TrackRow
            v-for="el in sortedElements"
            :key="el.id"
            :elementId="el.id"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import dataState, { updateElement } from '../../stores/dataState.js'
import uxState, { selectElement } from '../../stores/uxState.js'
import { sortedElements } from '../../stores/dataState.js'
import PlaybackControls from './PlaybackControls.vue'
import TimelineRuler from './TimelineRuler.vue'
import TrackRow from './TrackRow.vue'

const trackAreaRef = ref(null)
const labelsRef = ref(null)
const rulerRef = ref(null)

const selectedIds = computed(() => uxState.selectedIds)
const ppf = computed(() => uxState.pixelsPerFrame)
const playheadX = computed(() => uxState.currentFrame * ppf.value)

function onTrackScroll(e) {
  // Sync ruler scroll
  const ruler = rulerRef.value?.$el ?? rulerRef.value?.rulerRef
  if (ruler) ruler.scrollLeft = e.target.scrollLeft
}

function toggleVisibility(id) {
  const el = dataState.elements[id]
  if (el) updateElement(id, { visible: el.visible === false ? true : false })
}

// Zoom with Ctrl+Scroll
function onWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.5 : 0.5
  uxState.pixelsPerFrame = Math.max(1, Math.min(40, uxState.pixelsPerFrame + delta))
}

import { onMounted, onUnmounted } from 'vue'
onMounted(() => {
  trackAreaRef.value?.addEventListener('wheel', onWheel, { passive: false })
})
onUnmounted(() => {
  trackAreaRef.value?.removeEventListener('wheel', onWheel)
})
</script>

<style scoped>
.timeline-panel {
  grid-area: timeline;
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.timeline-header {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.timeline-toggle {
  height: 100%;
  padding: 0 14px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
}

.timeline-toggle:hover {
  color: var(--text);
}

.timeline-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.track-labels {
  width: var(--label-w);
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ruler-spacer {
  height: 25px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.track-label {
  height: 28px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  overflow: hidden;
}

.track-label:hover { background: var(--surface-2); color: var(--text); }
.track-label.selected { background: rgba(74,144,226,0.1); color: var(--text); }

.vis-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  flex-shrink: 0;
  width: 14px;
}
.vis-btn:hover { color: var(--text); }

.label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-area {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tracks-wrapper {
  flex: 1;
  min-width: max-content;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1.5px;
  background: var(--accent);
  pointer-events: none;
  z-index: 10;
  transform: translateX(-0.75px);
}
</style>
