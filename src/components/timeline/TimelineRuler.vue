<template>
  <div class="ruler-wrapper" ref="rulerRef">
    <svg
      class="ruler-svg"
      :width="totalWidth"
      height="24"
      @mousedown="onRulerMouseDown"
    >
      <rect width="100%" height="24" fill="var(--surface)" />
      <template v-for="frame in tickFrames" :key="frame">
        <line
          :x1="frame * ppf" :y1="frame % fps === 0 ? 4 : 14"
          :x2="frame * ppf" :y2="24"
          stroke="var(--border)" stroke-width="1"
        />
        <text
          v-if="frame % fps === 0"
          :x="frame * ppf + 3" :y="16"
          font-size="9" fill="var(--text-muted)"
          font-family="monospace"
        >{{ frame / fps }}s</text>
      </template>
      <!-- Playhead -->
      <line
        :x1="currentFrame * ppf" :y1="0"
        :x2="currentFrame * ppf" :y2="24"
        stroke="var(--accent)" stroke-width="2"
      />
    </svg>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState from '../../stores/dataState.js'
import { seekToFrame } from '../../stores/animationStore.js'

const emit = defineEmits(['scroll'])
const rulerRef = ref(null)

const ppf = computed(() => uxState.pixelsPerFrame)
const totalFrames = computed(() => dataState.project.totalFrames)
const fps = computed(() => dataState.project.fps)
const currentFrame = computed(() => uxState.currentFrame)
const totalWidth = computed(() => totalFrames.value * ppf.value + 40)

const tickFrames = computed(() => {
  const frames = []
  const step = ppf.value < 2 ? fps.value : ppf.value < 6 ? Math.ceil(fps.value / 4) : 1
  for (let f = 0; f <= totalFrames.value; f += step) frames.push(f)
  return frames
})

function onRulerMouseDown(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  function toFrame(clientX) {
    return Math.round((clientX - rect.left) / ppf.value)
  }
  seekToFrame(toFrame(e.clientX))

  const onMove = (me) => seekToFrame(Math.max(0, Math.min(totalFrames.value, toFrame(me.clientX))))
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

defineExpose({ rulerRef })
</script>

<style scoped>
.ruler-wrapper {
  overflow: hidden;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.ruler-svg {
  display: block;
  cursor: col-resize;
}
</style>
