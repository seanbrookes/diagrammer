<template>
  <g v-if="el" class="selection-overlay" pointer-events="none">
    <!-- Bounding box border -->
    <rect
      v-if="bbox"
      :x="bbox.x - 1/z" :y="bbox.y - 1/z"
      :width="bbox.width + 2/z" :height="bbox.height + 2/z"
      fill="none" stroke="#4a90e2" :stroke-width="1/z"
      :stroke-dasharray="`${4/z} ${3/z}`" pointer-events="none"
    />

    <!-- Rect: 8 resize handles (small squares) -->
    <template v-if="el.type === 'rect'">
      <rect
        v-for="h in rectHandles" :key="h.name"
        :data-handle="h.name"
        :x="h.cx - 3/z" :y="h.cy - 3/z"
        :width="6/z" :height="6/z"
        fill="#ffffff" stroke="#4a90e2" :stroke-width="1/z"
        :style="{ cursor: h.cursor, pointerEvents: 'all' }"
      />
    </template>

    <!-- Line / Arrow: endpoint handles (small squares) -->
    <template v-else-if="el.type === 'line' || el.type === 'arrow'">
      <rect
        data-handle="p1"
        :x="el.x1 - 4/z" :y="el.y1 - 4/z"
        :width="8/z" :height="8/z"
        fill="#ffffff" stroke="#4a90e2" :stroke-width="1/z"
        style="cursor: crosshair; pointer-events: all"
      />
      <rect
        data-handle="p2"
        :x="el.x2 - 4/z" :y="el.y2 - 4/z"
        :width="8/z" :height="8/z"
        fill="#ffffff" stroke="#e94560" :stroke-width="1/z"
        style="cursor: crosshair; pointer-events: all"
      />
    </template>

    <!-- Pen: anchor + control-arm handles when in pen edit mode -->
    <template v-else-if="el.type === 'pen' && isPenEditing">
      <template v-for="(seg, i) in el.segments" :key="`ps-${i}`">
        <!-- Control arm lines -->
        <line v-if="seg.cpOut"
          :x1="seg.x" :y1="seg.y" :x2="seg.cpOut.x" :y2="seg.cpOut.y"
          stroke="#4a90e2" :stroke-width="0.75/z" :stroke-dasharray="`${3/z} ${2/z}`" opacity="0.65"
          pointer-events="none"
        />
        <line v-if="seg.cpIn"
          :x1="seg.x" :y1="seg.y" :x2="seg.cpIn.x" :y2="seg.cpIn.y"
          stroke="#4a90e2" :stroke-width="0.75/z" :stroke-dasharray="`${3/z} ${2/z}`" opacity="0.65"
          pointer-events="none"
        />
        <!-- cpOut circle handle -->
        <circle v-if="seg.cpOut"
          :data-pen-handle="`cp-out-${i}`"
          :cx="seg.cpOut.x" :cy="seg.cpOut.y" :r="3.5/z"
          fill="#4a90e2" stroke="#ffffff" :stroke-width="1/z"
          style="cursor: crosshair; pointer-events: all"
        />
        <!-- cpIn circle handle -->
        <circle v-if="seg.cpIn"
          :data-pen-handle="`cp-in-${i}`"
          :cx="seg.cpIn.x" :cy="seg.cpIn.y" :r="3.5/z"
          fill="#4a90e2" stroke="#ffffff" :stroke-width="1/z"
          style="cursor: crosshair; pointer-events: all"
        />
        <!-- Anchor square handle (on top so it's easier to click) -->
        <rect
          :data-pen-handle="`anchor-${i}`"
          :x="seg.x - 4/z" :y="seg.y - 4/z"
          :width="8/z" :height="8/z"
          fill="#ffffff" stroke="#4a90e2" :stroke-width="1.5/z"
          style="cursor: move; pointer-events: all"
        />
      </template>
    </template>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { getBoundingBox } from '../../utils/geometry.js'
import dataState from '../../stores/dataState.js'
import uxState from '../../stores/uxState.js'

const props = defineProps({
  elementId: { type: String, required: true },
})

const el = computed(() => dataState.elements[props.elementId])
const bbox = computed(() => el.value ? getBoundingBox(el.value) : null)
const isPenEditing = computed(() => uxState.editingPenId === props.elementId)
const z = computed(() => uxState.canvasZoom)

const rectHandles = computed(() => {
  if (!bbox.value) return []
  const { x, y, width, height } = bbox.value
  return [
    { name: 'nw', cx: x,           cy: y,            cursor: 'nw-resize' },
    { name: 'n',  cx: x+width/2,   cy: y,            cursor: 'n-resize'  },
    { name: 'ne', cx: x+width,     cy: y,            cursor: 'ne-resize' },
    { name: 'e',  cx: x+width,     cy: y+height/2,   cursor: 'e-resize'  },
    { name: 'se', cx: x+width,     cy: y+height,     cursor: 'se-resize' },
    { name: 's',  cx: x+width/2,   cy: y+height,     cursor: 's-resize'  },
    { name: 'sw', cx: x,           cy: y+height,     cursor: 'sw-resize' },
    { name: 'w',  cx: x,           cy: y+height/2,   cursor: 'w-resize'  },
  ]
})
</script>
