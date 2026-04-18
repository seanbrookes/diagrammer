import { reactive, computed, watch } from 'vue'
import gsap from 'gsap'
import dataState, { keyframesByElement } from './dataState.js'
import uxState from './uxState.js'

// Per-element proxy objects that GSAP mutates during animation.
// SvgCanvas renders from these rather than raw dataState.elements.
export const elementProxies = reactive({})

export const sortedElementProxies = computed(() =>
  dataState.elementOrder
    .map(id => elementProxies[id])
    .filter(Boolean)
)

let gTimeline = null

export function ensureProxy(elementId) {
  if (!elementProxies[elementId]) {
    const el = dataState.elements[elementId]
    if (el) elementProxies[elementId] = reactive({ ...el })
  }
}

export function removeProxy(elementId) {
  delete elementProxies[elementId]
}

export function syncProxyToElement(elementId) {
  const el = dataState.elements[elementId]
  if (el && elementProxies[elementId]) {
    Object.assign(elementProxies[elementId], el)
  }
}

export function rebuildGsapTimeline() {
  gTimeline?.kill()
  const fps = dataState.project.fps
  const duration = dataState.project.totalFrames / fps

  const tl = gsap.timeline({
    paused: true,
    duration,
    onUpdate() {
      if (uxState.isPlaying) {
        uxState.currentFrame = tl.time() * fps
      }
    },
    onComplete() {
      if (uxState.isLooping) {
        tl.restart()
      } else {
        uxState.isPlaying = false
        uxState.currentFrame = dataState.project.totalFrames
      }
    },
  })

  for (const [elementId, kfs] of Object.entries(keyframesByElement.value)) {
    if (!kfs.length) continue
    ensureProxy(elementId)
    const proxy = elementProxies[elementId]

    // Sync proxy to first keyframe state at time 0
    gsap.set(proxy, { ...kfs[0].props })

    for (let i = 0; i < kfs.length - 1; i++) {
      const from = kfs[i]
      const to = kfs[i + 1]
      const startTime = from.frame / fps
      const segDuration = (to.frame - from.frame) / fps

      tl.fromTo(
        proxy,
        { ...from.props },
        { ...to.props, duration: segDuration, ease: from.easing },
        startTime
      )
    }
  }

  gTimeline = tl

  // Seek to current frame so the canvas stays in sync after rebuild
  seekToFrame(uxState.currentFrame)
}

export function seekToFrame(frame) {
  uxState.currentFrame = frame
  if (gTimeline) {
    gTimeline.seek(frame / dataState.project.fps)
  } else {
    // No timeline yet — just sync proxies from element state
    for (const id of dataState.elementOrder) {
      ensureProxy(id)
    }
  }
}

export function play() {
  uxState.isPlaying = true
  if (!gTimeline) rebuildGsapTimeline()
  gTimeline.seek(uxState.currentFrame / dataState.project.fps)
  gTimeline.play()
}

export function pause() {
  uxState.isPlaying = false
  gTimeline?.pause()
}

export function stop() {
  uxState.isPlaying = false
  gTimeline?.pause()
  seekToFrame(0)
}

// Auto-rebuild timeline when keyframes change
watch(
  () => JSON.stringify(dataState.keyframes),
  () => { rebuildGsapTimeline() },
  { deep: false }
)

// Keep proxy list in sync with element list
watch(
  () => [...dataState.elementOrder],
  (newOrder) => {
    // Add missing proxies
    for (const id of newOrder) ensureProxy(id)
    // Remove stale proxies
    for (const id of Object.keys(elementProxies)) {
      if (!dataState.elements[id]) removeProxy(id)
    }
  },
  { immediate: true }
)
