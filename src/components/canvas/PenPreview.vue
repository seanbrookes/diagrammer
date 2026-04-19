<template>
  <g v-if="penState.active" pointer-events="none" class="pen-preview">

    <!-- Path segments committed so far -->
    <path
      v-if="completedPath"
      :d="completedPath"
      fill="none" stroke="#333" stroke-width="1"
      stroke-linecap="round" stroke-linejoin="round"
    />

    <!-- Rubber-band line from last anchor to cursor (not dragging) -->
    <line
      v-if="lastSeg && !penState.isDragging"
      :x1="lastSeg.x" :y1="lastSeg.y"
      :x2="penState.mouseX" :y2="penState.mouseY"
      stroke="#4a90e2" stroke-width="1" stroke-dasharray="4 2"
    />

    <!-- Bezier handle preview while dragging -->
    <template v-if="lastSeg && penState.isDragging && penState.dragCpOut">
      <line
        :x1="lastSeg.x" :y1="lastSeg.y"
        :x2="penState.dragCpOut.x" :y2="penState.dragCpOut.y"
        stroke="#4a90e2" stroke-width="1"
      />
      <line
        :x1="lastSeg.x" :y1="lastSeg.y"
        :x2="mirrorX" :y2="mirrorY"
        stroke="#4a90e2" stroke-width="1"
      />
      <circle :cx="penState.dragCpOut.x" :cy="penState.dragCpOut.y"
              r="3" fill="#4a90e2" stroke="none" />
      <circle :cx="mirrorX" :cy="mirrorY"
              r="3" fill="#4a90e2" stroke="none" />
    </template>

    <!-- Handle lines for already-placed smooth anchors -->
    <template v-for="(seg, i) in penState.segments" :key="`h-${i}`">
      <template v-if="seg.cpOut && i < penState.segments.length - 1">
        <line :x1="seg.x" :y1="seg.y" :x2="seg.cpOut.x" :y2="seg.cpOut.y"
              stroke="#4a90e2" stroke-width="0.75" opacity="0.6" />
        <line v-if="seg.cpIn"
              :x1="seg.x" :y1="seg.y" :x2="seg.cpIn.x" :y2="seg.cpIn.y"
              stroke="#4a90e2" stroke-width="0.75" opacity="0.6" />
        <circle :cx="seg.cpOut.x" :cy="seg.cpOut.y"
                r="2.5" fill="#4a90e2" opacity="0.6" />
        <circle v-if="seg.cpIn" :cx="seg.cpIn.x" :cy="seg.cpIn.y"
                r="2.5" fill="#4a90e2" opacity="0.6" />
      </template>
    </template>

    <!-- Anchor point diamonds -->
    <circle
      v-for="(seg, i) in penState.segments" :key="`a-${i}`"
      :cx="seg.x" :cy="seg.y" r="4"
      fill="white" stroke="#4a90e2" stroke-width="1.5"
    />

    <!-- Close-path indicator ring around first anchor -->
    <circle
      v-if="penState.segments.length >= 2 && isNearFirst"
      :cx="penState.segments[0].x" :cy="penState.segments[0].y"
      r="9" fill="none" stroke="#4a90e2" stroke-width="1.5" opacity="0.7"
    />
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { penState } from '../../composables/usePen.js'
import { segmentsToDPath } from '../../utils/penPath.js'

const CLOSE_RADIUS = 8

const lastSeg = computed(() =>
  penState.segments.length ? penState.segments[penState.segments.length - 1] : null
)

const mirrorX = computed(() =>
  lastSeg.value && penState.dragCpOut
    ? 2 * lastSeg.value.x - penState.dragCpOut.x : 0
)
const mirrorY = computed(() =>
  lastSeg.value && penState.dragCpOut
    ? 2 * lastSeg.value.y - penState.dragCpOut.y : 0
)

const completedPath = computed(() =>
  penState.segments.length >= 2 ? segmentsToDPath(penState.segments) : null
)

const isNearFirst = computed(() => {
  if (penState.segments.length < 2) return false
  const f = penState.segments[0]
  const dx = penState.mouseX - f.x
  const dy = penState.mouseY - f.y
  return Math.sqrt(dx * dx + dy * dy) < CLOSE_RADIUS
})
</script>
