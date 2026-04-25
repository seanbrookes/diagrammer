<template>
  <!-- rect -->
  <rect
    v-if="el.type === 'rect'"
    :data-id="el.id"
    :x="el.x" :y="el.y"
    :width="Math.max(1, el.width ?? 1)"
    :height="Math.max(1, el.height ?? 1)"
    :rx="el.rx ?? 0"
    :fill="el.fill"
    :stroke="el.stroke"
    :stroke-width="el.strokeWidth"
    :opacity="el.opacity"
    style="cursor: move"
  />

  <!-- ellipse -->
  <ellipse
    v-else-if="el.type === 'ellipse'"
    :data-id="el.id"
    :cx="el.cx" :cy="el.cy"
    :rx="Math.max(1, el.rx ?? 1)"
    :ry="Math.max(1, el.ry ?? 1)"
    :fill="el.fill"
    :stroke="el.stroke"
    :stroke-width="el.strokeWidth"
    :opacity="el.opacity"
    style="cursor: move"
  />

  <!-- line -->
  <line
    v-else-if="el.type === 'line'"
    :data-id="el.id"
    :x1="el.x1" :y1="el.y1"
    :x2="el.x2" :y2="el.y2"
    :stroke="el.stroke"
    :stroke-width="el.strokeWidth"
    :opacity="el.opacity"
    stroke-linecap="round"
    style="cursor: move"
  />

  <!-- arrow — color: el.stroke makes currentColor in the marker inherit the line color -->
  <line
    v-else-if="el.type === 'arrow'"
    :data-id="el.id"
    :x1="el.x1" :y1="el.y1"
    :x2="el.x2" :y2="el.y2"
    :stroke="el.stroke"
    :stroke-width="el.strokeWidth"
    :opacity="el.opacity"
    :marker-end="el.markerEnd ? 'url(#arrowhead)' : null"
    :marker-start="el.markerStart ? 'url(#arrowhead-start)' : null"
    stroke-linecap="round"
    :style="{ cursor: 'move', color: el.stroke }"
  />

  <!-- text (multi-line with bullet parsing) — hidden while editor overlay is active -->
  <text
    v-else-if="el.type === 'text' && uxState.editingTextId !== el.id"
    :data-id="el.id"
    :x="el.x" :y="el.y"
    :font-size="el.fontSize"
    :font-family="el.fontFamily"
    :font-weight="el.fontWeight"
    :fill="el.fill"
    :opacity="el.opacity"
    style="cursor: move; user-select: none"
  >
    <tspan
      v-for="(line, i) in parseTextLines(el)"
      :key="i"
      :x="el.x + line.indent"
      :dy="i === 0 ? 0 : el.fontSize * 1.4"
    >{{ line.text || ' ' }}</tspan>
  </text>

  <!-- path / pen -->
  <path
    v-else-if="el.type === 'path' || el.type === 'pen'"
    :data-id="el.id"
    :d="el.d"
    :stroke="el.stroke"
    :stroke-width="el.strokeWidth"
    :fill="el.fill"
    :opacity="el.opacity"
    stroke-linecap="round"
    stroke-linejoin="round"
    style="cursor: move"
  />
</template>

<script setup>
import { parseTextLines } from '../../utils/textUtils.js'
import uxState from '../../stores/uxState.js'

defineProps({
  el: { type: Object, required: true },
})
</script>
