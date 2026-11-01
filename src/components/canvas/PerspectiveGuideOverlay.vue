<template>
  <g v-if="pg.enabled">
    <!-- Horizon line — dashed, slightly dimmer -->
    <line v-if="horizonSeg"
      :x1="horizonSeg.x1" :y1="horizonSeg.y1"
      :x2="horizonSeg.x2" :y2="horizonSeg.y2"
      :stroke="pg.color"
      :stroke-width="1 / z"
      :opacity="pg.opacity * 0.55"
      :stroke-dasharray="`${6/z} ${3/z}`"
      pointer-events="none"
    />

    <!-- Fan lines per VP -->
    <template v-for="group in fanLines" :key="`fan-${group.vpIndex}`">
      <line
        v-for="(seg, i) in group.lines" :key="i"
        :x1="seg.x1" :y1="seg.y1" :x2="seg.x2" :y2="seg.y2"
        :stroke="pg.color"
        :stroke-width="1 / z"
        :opacity="pg.opacity"
        pointer-events="none"
      />
    </template>

    <!-- VP handles — rendered at actual world position, visible when zoomed out -->
    <g
      v-for="(vp, i) in activeVps" :key="`vp-${i}`"
      :data-vp-index="i"
      style="cursor: grab"
    >
      <!-- Hit target (larger transparent circle for easier grabbing) -->
      <circle
        :cx="vp.x" :cy="vp.y" :r="12 / z"
        fill="transparent"
        :data-vp-index="i"
      />
      <!-- Visible ring -->
      <circle
        :cx="vp.x" :cy="vp.y" :r="7 / z"
        fill="rgba(0,0,0,0.35)" :stroke="pg.color" :stroke-width="1.5 / z"
        pointer-events="none"
      />
      <!-- Crosshair ticks -->
      <line
        :x1="vp.x - 4/z" :y1="vp.y" :x2="vp.x + 4/z" :y2="vp.y"
        :stroke="pg.color" :stroke-width="1 / z" pointer-events="none"
      />
      <line
        :x1="vp.x" :y1="vp.y - 4/z" :x2="vp.x" :y2="vp.y + 4/z"
        :stroke="pg.color" :stroke-width="1 / z" pointer-events="none"
      />
      <!-- Label -->
      <text
        :x="vp.x + 10 / z" :y="vp.y + 4 / z"
        :font-size="10 / z"
        :fill="pg.color"
        font-family="Inter, system-ui, sans-serif"
        pointer-events="none"
        opacity="0.8"
      >VP{{ i + 1 }}</text>
    </g>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import uxState from '../../stores/uxState.js'
import { fanLines, horizonSeg, activeVps } from '../../composables/usePerspectiveGuide.js'

const pg = uxState.perspectiveGuide
const z = computed(() => uxState.canvasZoom)
</script>
