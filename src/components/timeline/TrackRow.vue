<template>
  <div
    class="track-row"
    @contextmenu.prevent="onContextMenu"
  >
    <svg
      class="track-svg"
      :width="totalWidth"
      height="28"
    >
      <!-- Tween regions between keyframes -->
      <rect
        v-for="seg in tweenSegments" :key="seg.key"
        :x="seg.x" :y="8" :width="seg.width" :height="12"
        fill="rgba(74,144,226,0.25)" rx="2"
      />

      <!-- Keyframe diamonds -->
      <KeyframeDiamond
        v-for="kf in keyframes"
        :key="kf.id"
        :kf="kf"
        :ppf="ppf"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState, { addKeyframe, keyframesByElement } from '../../stores/dataState.js'
import { elementProxies } from '../../stores/animationStore.js'
import { extractTweenableProps } from '../../composables/useDrawing.js'
import KeyframeDiamond from './KeyframeDiamond.vue'

const props = defineProps({
  elementId: { type: String, required: true },
})

const ppf = computed(() => uxState.pixelsPerFrame)
const totalWidth = computed(() => dataState.project.totalFrames * ppf.value + 40)
const keyframes = computed(() => keyframesByElement.value[props.elementId] ?? [])

const tweenSegments = computed(() => {
  const kfs = keyframes.value
  if (kfs.length < 2) return []
  return kfs.slice(0, -1).map((kf, i) => ({
    key: kf.id,
    x: kf.frame * ppf.value,
    width: (kfs[i + 1].frame - kf.frame) * ppf.value,
  }))
})

function onContextMenu(e) {
  const trackRect = e.currentTarget.getBoundingClientRect()
  const frame = Math.round((e.clientX - trackRect.left) / ppf.value)
  // Add keyframe at clicked position using current proxy state
  const proxy = elementProxies[props.elementId]
  const el = dataState.elements[props.elementId]
  if (!proxy && !el) return
  const props_ = extractTweenableProps(proxy ?? el)
  addKeyframe(props.elementId, frame, props_)
}
</script>

<style scoped>
.track-row {
  height: 28px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  flex-shrink: 0;
}

.track-svg {
  display: block;
  cursor: pointer;
}
</style>
