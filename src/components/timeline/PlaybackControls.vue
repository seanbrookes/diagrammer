<template>
  <div class="playback-controls">
    <button class="pb-btn" title="Stop" @click="stop">⏹</button>
    <button class="pb-btn" :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'" @click="toggle">
      {{ isPlaying ? '⏸' : '▶' }}
    </button>
    <button class="pb-btn" :class="{ active: isLooping }" title="Loop" @click="toggleLoop">⟳</button>

    <div class="frame-display">
      <span class="frame-num">{{ frameDisplay }}</span>
      <span class="frame-sep">/</span>
      <span class="frame-total">{{ totalFrames }}</span>
    </div>

    <div class="fps-display">{{ fps }} fps</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState from '../../stores/dataState.js'
import { play, pause, stop as doStop } from '../../stores/animationStore.js'

const isPlaying = computed(() => uxState.isPlaying)
const isLooping = computed(() => uxState.isLooping)
const fps = computed(() => dataState.project.fps)
const totalFrames = computed(() => dataState.project.totalFrames)
const frameDisplay = computed(() => Math.round(uxState.currentFrame))

function toggle() { isPlaying.value ? pause() : play() }
function stop() { doStop() }
function toggleLoop() { uxState.isLooping = !uxState.isLooping }
</script>

<style scoped>
.playback-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 36px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.pb-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pb-btn:hover { background: var(--surface-2); }
.pb-btn.active { color: var(--accent); }

.frame-display {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
  font-size: 12px;
  font-family: monospace;
}

.frame-num { color: var(--text); min-width: 32px; text-align: right; }
.frame-sep { color: var(--text-muted); }
.frame-total { color: var(--text-muted); }

.fps-display {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
