import { reactive, computed } from 'vue'
import { generateId } from '../utils/idgen.js'

const dataState = reactive({
  project: {
    id: generateId('proj'),
    name: 'Untitled',
    fps: 24,
    totalFrames: 240,
    canvasWidth: 1280,
    canvasHeight: 720,
    background: '#ffffff',
  },
  elements: {},
  elementOrder: [],
  keyframes: {},
})

export const sortedElements = computed(() =>
  dataState.elementOrder.map(id => dataState.elements[id]).filter(Boolean)
)

export const keyframesByElement = computed(() => {
  const map = {}
  for (const kf of Object.values(dataState.keyframes)) {
    if (!map[kf.elementId]) map[kf.elementId] = []
    map[kf.elementId].push(kf)
  }
  for (const id in map) {
    map[id].sort((a, b) => a.frame - b.frame)
  }
  return map
})

// Elements
export function addElement(element) {
  const id = element.id ?? generateId('el')
  const el = { ...element, id }
  dataState.elements[id] = el
  dataState.elementOrder.push(id)
  return el
}

export function removeElement(id) {
  delete dataState.elements[id]
  dataState.elementOrder = dataState.elementOrder.filter(x => x !== id)
  // Remove associated keyframes
  for (const kfId of Object.keys(dataState.keyframes)) {
    if (dataState.keyframes[kfId].elementId === id) {
      delete dataState.keyframes[kfId]
    }
  }
}

export function updateElement(id, patch) {
  if (dataState.elements[id]) {
    Object.assign(dataState.elements[id], patch)
  }
}

export function bringForward(id) {
  const idx = dataState.elementOrder.indexOf(id)
  if (idx < dataState.elementOrder.length - 1) {
    const arr = [...dataState.elementOrder]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    dataState.elementOrder = arr
  }
}

export function sendBackward(id) {
  const idx = dataState.elementOrder.indexOf(id)
  if (idx > 0) {
    const arr = [...dataState.elementOrder]
    ;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
    dataState.elementOrder = arr
  }
}

// Keyframes
export function addKeyframe(elementId, frame, props, easing = 'power1.inOut') {
  // If a keyframe already exists at this frame for this element, update it
  const existing = Object.values(dataState.keyframes).find(
    kf => kf.elementId === elementId && kf.frame === frame
  )
  if (existing) {
    Object.assign(existing, { props: { ...props }, easing })
    return existing
  }
  const id = generateId('kf')
  const kf = { id, elementId, frame, easing, props: { ...props } }
  dataState.keyframes[id] = kf
  return kf
}

export function removeKeyframe(id) {
  delete dataState.keyframes[id]
}

export function updateKeyframe(id, patch) {
  if (dataState.keyframes[id]) {
    Object.assign(dataState.keyframes[id], patch)
  }
}

export function moveKeyframe(id, newFrame) {
  if (dataState.keyframes[id]) {
    dataState.keyframes[id].frame = Math.max(0, Math.round(newFrame))
  }
}

// Project
export function updateProject(patch) {
  Object.assign(dataState.project, patch)
}

export function resetProject() {
  dataState.project = {
    id: generateId('proj'),
    name: 'Untitled',
    fps: 24,
    totalFrames: 240,
    canvasWidth: 1280,
    canvasHeight: 720,
    background: '#ffffff',
  }
  dataState.elements = {}
  dataState.elementOrder = []
  dataState.keyframes = {}
}

export function loadProjectData(data) {
  dataState.project = { ...data.project }
  dataState.elements = { ...data.elements }
  dataState.elementOrder = [...data.elementOrder]
  dataState.keyframes = { ...data.keyframes }
}

export default dataState
