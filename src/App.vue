<template>
  <AppLayout />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import AppLayout from './components/layout/AppLayout.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js'
import dataState, { flushSession } from './stores/dataState.js'
import { rebuildGsapTimeline } from './stores/animationStore.js'
import { exitSceneEdit, enterSceneEdit } from './stores/sceneStore.js'
import uxState from './stores/uxState.js'

const RESUME_KEY = 'diagrammer_resume_scene'

useKeyboardShortcuts()

function onBeforeUnload() {
  const activeId = uxState.activeSceneId
  // exitSceneEdit saves current elements back to scene and restores base canvas
  if (activeId) exitSceneEdit()
  // Remember which scene to return to after reload
  if (activeId) sessionStorage.setItem(RESUME_KEY, activeId)
  else sessionStorage.removeItem(RESUME_KEY)
  flushSession()
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)

  const resumeId = sessionStorage.getItem(RESUME_KEY)
  if (resumeId && dataState.scenes.find(s => s.id === resumeId)) {
    sessionStorage.removeItem(RESUME_KEY)
    enterSceneEdit(resumeId)
  }
  rebuildGsapTimeline()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
