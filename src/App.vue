<template>
  <AppLayout />
</template>

<script setup>
import AppLayout from './components/layout/AppLayout.vue'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js'

useKeyboardShortcuts()
</script>
