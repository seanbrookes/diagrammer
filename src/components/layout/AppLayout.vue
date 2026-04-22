<template>
  <div class="app-layout">
    <Toolbar />
    <StoryboardCanvas v-if="storyboardMode" />
    <SvgCanvas v-else />
    <PropertiesPanel />
    <TimelinePanel />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Toolbar from './Toolbar.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SvgCanvas from '../canvas/SvgCanvas.vue'
import StoryboardCanvas from '../canvas/StoryboardCanvas.vue'
import TimelinePanel from '../timeline/TimelinePanel.vue'
import uxState from '../../stores/uxState.js'

const storyboardMode = computed(() => uxState.storyboardMode)
</script>

<style scoped>
.app-layout {
  display: grid;
  grid-template-rows: var(--toolbar-h) 1fr var(--timeline-h);
  grid-template-columns: 1fr var(--props-w);
  grid-template-areas:
    "toolbar    toolbar"
    "canvas     properties"
    "timeline   timeline";
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
