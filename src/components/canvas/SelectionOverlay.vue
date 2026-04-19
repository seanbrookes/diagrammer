<template>
  <g v-if="el" class="selection-overlay" pointer-events="none">
    <!-- Bounding box border -->
    <rect
      v-if="bbox"
      :x="bbox.x - 1" :y="bbox.y - 1"
      :width="bbox.width + 2" :height="bbox.height + 2"
      fill="none" stroke="#4a90e2" stroke-width="1"
      stroke-dasharray="4 3" pointer-events="none"
    />

    <!-- Rect: 8 resize handles (small squares) -->
    <template v-if="el.type === 'rect'">
      <rect
        v-for="h in rectHandles" :key="h.name"
        :data-handle="h.name"
        :x="h.cx - 3" :y="h.cy - 3"
        width="6" height="6"
        fill="#ffffff" stroke="#4a90e2" stroke-width="1"
        :style="{ cursor: h.cursor, pointerEvents: 'all' }"
      />
    </template>

    <!-- Line / Arrow: endpoint handles (small squares) -->
    <template v-else-if="el.type === 'line' || el.type === 'arrow'">
      <rect
        data-handle="p1"
        :x="el.x1 - 4" :y="el.y1 - 4"
        width="8" height="8"
        fill="#ffffff" stroke="#4a90e2" stroke-width="1"
        style="cursor: crosshair; pointer-events: all"
      />
      <rect
        data-handle="p2"
        :x="el.x2 - 4" :y="el.y2 - 4"
        width="8" height="8"
        fill="#ffffff" stroke="#e94560" stroke-width="1"
        style="cursor: crosshair; pointer-events: all"
      />
    </template>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { getBoundingBox } from '../../utils/geometry.js'
import dataState from '../../stores/dataState.js'

const props = defineProps({
  elementId: { type: String, required: true },
})

const el = computed(() => dataState.elements[props.elementId])
const bbox = computed(() => el.value ? getBoundingBox(el.value) : null)

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
