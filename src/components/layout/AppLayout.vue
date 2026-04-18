<template>
  <div class="app-layout">
    <Toolbar />
    <SvgCanvas />
    <PropertiesPanel />
    <TimelinePanel />
  </div>
</template>

<script setup>
import Toolbar from './Toolbar.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SvgCanvas from '../canvas/SvgCanvas.vue'
import TimelinePanel from '../timeline/TimelinePanel.vue'
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
