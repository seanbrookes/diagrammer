<template>
  <!-- Rendered inside the storyboard SVG; parent applies translate/scale transform -->
  <g @click.stop="$emit('click')" @dblclick.stop="$emit('dblclick')" style="cursor: pointer">
    <!-- Canvas background (scene override or diagram default) -->
    <rect
      :width="canvasWidth" :height="canvasHeight"
      :fill="props.scene.background || project.background" rx="2"
    />

    <!-- Element snapshots -->
    <ElementRenderer
      v-for="el in renderElements"
      :key="el.id"
      :el="el"
      style="pointer-events: none"
    />

    <!-- Selection ring -->
    <rect
      :width="canvasWidth" :height="canvasHeight"
      fill="none"
      :stroke="selected ? '#4a90e2' : 'rgba(255,255,255,0.15)'"
      :stroke-width="selected ? 4 : 2"
      rx="2"
      pointer-events="none"
    />

    <!-- Sequence badge top-left -->
    <rect x="12" y="12" width="52" height="28" rx="4" fill="rgba(0,0,0,0.55)" pointer-events="none" />
    <text x="38" y="31" text-anchor="middle" font-size="16" fill="#6db3f2"
          font-family="Inter, system-ui, sans-serif" font-weight="600" pointer-events="none"
    >#{{ scene.sequence ?? '' }}</text>

    <!-- Frame badge top-right -->
    <rect :x="canvasWidth - 90" y="12" width="78" height="28" rx="4" fill="rgba(0,0,0,0.5)" pointer-events="none" />
    <text :x="canvasWidth - 51" y="31" text-anchor="middle" font-size="16" fill="#ccc"
          font-family="Inter, system-ui, sans-serif" pointer-events="none"
    >f {{ scene.frame }}</text>

    <!-- Scene name label below -->
    <text
      :x="canvasWidth / 2" :y="canvasHeight + 28"
      text-anchor="middle"
      font-size="20"
      :fill="selected ? '#4a90e2' : '#aaa'"
      font-family="Inter, system-ui, sans-serif"
      pointer-events="none"
    >{{ sceneLabel(scene) }}</text>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import dataState from '../../stores/dataState.js'
import { sceneLabel } from '../../stores/sceneStore.js'
import ElementRenderer from './ElementRenderer.vue'

const props = defineProps({
  scene: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})
defineEmits(['click', 'dblclick'])

const project = computed(() => dataState.project)
const canvasWidth = computed(() => dataState.project.canvasWidth)
const canvasHeight = computed(() => dataState.project.canvasHeight)

const renderElements = computed(() => {
  // Modern scenes store full element objects — render directly from scene data
  if (props.scene.elements && Object.keys(props.scene.elements).length > 0) {
    const order = props.scene.elementOrder ?? Object.keys(props.scene.elements)
    return order.map(id => props.scene.elements[id]).filter(Boolean)
  }
  // Legacy scenes only have elementStates — merge tweenableProps onto base elements
  return dataState.elementOrder
    .map(id => {
      const el = dataState.elements[id]
      if (!el) return null
      const state = props.scene.elementStates?.[id]
      return state ? { ...el, ...state } : { ...el }
    })
    .filter(Boolean)
})
</script>
