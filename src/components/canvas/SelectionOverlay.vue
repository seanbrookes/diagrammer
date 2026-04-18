<template>
  <g v-if="bbox" class="selection-overlay" pointer-events="none">
    <!-- Selection border -->
    <rect
      :x="bbox.x - 2" :y="bbox.y - 2"
      :width="bbox.width + 4" :height="bbox.height + 4"
      fill="none" stroke="#4a90e2" stroke-width="1.5"
      stroke-dasharray="4 2" pointer-events="none"
    />

    <!-- Resize handles (only for resizable types) -->
    <template v-if="isResizable">
      <circle
        v-for="h in handles" :key="h.name"
        :data-handle="h.name"
        :cx="h.cx" :cy="h.cy"
        r="5" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.5"
        :style="{ cursor: h.cursor, pointerEvents: 'all' }"
      />
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

const isResizable = computed(() => el.value?.type === 'rect')

const handles = computed(() => {
  if (!bbox.value) return []
  const { x, y, width, height } = bbox.value
  return [
    { name: 'nw', cx: x,          cy: y,           cursor: 'nw-resize' },
    { name: 'n',  cx: x+width/2,  cy: y,           cursor: 'n-resize'  },
    { name: 'ne', cx: x+width,    cy: y,           cursor: 'ne-resize' },
    { name: 'e',  cx: x+width,    cy: y+height/2,  cursor: 'e-resize'  },
    { name: 'se', cx: x+width,    cy: y+height,    cursor: 'se-resize' },
    { name: 's',  cx: x+width/2,  cy: y+height,    cursor: 's-resize'  },
    { name: 'sw', cx: x,          cy: y+height,    cursor: 'sw-resize' },
    { name: 'w',  cx: x,          cy: y+height/2,  cursor: 'w-resize'  },
  ]
})
</script>
