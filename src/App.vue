<template>
  <AppLayout />
</template>

<script setup>
import { onMounted } from 'vue'
import AppLayout from './components/layout/AppLayout.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js'
import dataState from './stores/dataState.js'
import { rebuildGsapTimeline } from './stores/animationStore.js'

useKeyboardShortcuts()

onMounted(() => {
  // If session data was restored, the keyframes watch won't fire (no change detected).
  // Explicitly rebuild so the GSAP timeline is playable immediately.
  if (dataState.elementOrder.length > 0) {
    rebuildGsapTimeline()
  }
})
</script>
