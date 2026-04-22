import { reactive } from 'vue'
import dataState, { addKeyframe } from './dataState.js'
import uxState from './uxState.js'
import { elementProxies, ensureProxy, removeProxy } from './animationStore.js'
import { extractTweenableProps } from '../composables/useDrawing.js'
import { generateId } from '../utils/idgen.js'
import { pause } from './animationStore.js'

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// Pre-scene-edit snapshots — restored in full on exit
let _savedElements    = {}
let _savedElementOrder = []
let _savedKeyframes   = {}

// Toast shown briefly after a scene is captured
export const captureToast = reactive({ visible: false, label: '' })
let _toastTimer = null

// Sync elementProxies to current dataState.elements:
// removes proxies for deleted elements, creates/updates proxies for existing ones.
function syncProxies() {
  for (const id of Object.keys(elementProxies)) {
    if (!dataState.elements[id]) removeProxy(id)
  }
  for (const id of dataState.elementOrder) {
    ensureProxy(id)
    const proxy = elementProxies[id]
    const el    = dataState.elements[id]
    if (proxy && el) Object.assign(proxy, el)
  }
}

// Return the display label for a scene: user-set name or "Scene N" fallback
export function sceneLabel(scene) {
  return scene.name || `Scene ${scene.sequence}`
}

// Sort by sequence and reassign 1..N. Uses splice to guarantee Vue reactivity.
export function renumberSequences() {
  const sorted = [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  sorted.forEach((s, i) => { s.sequence = i + 1 })
  dataState.scenes.splice(0, dataState.scenes.length, ...sorted)
}

// Assign sequence numbers to any scenes that are missing them (legacy data migration)
export function backfillSequences() {
  let max = 0
  for (const s of dataState.scenes) {
    if (s.sequence != null) max = Math.max(max, s.sequence)
  }
  for (const s of dataState.scenes) {
    if (s.sequence == null) s.sequence = ++max
  }
}

// Capture current canvas state as a new scene appended at the end.
export function captureScene(name) {
  backfillSequences()
  const sequence = dataState.scenes.length > 0
    ? Math.max(...dataState.scenes.map(s => s.sequence)) + 1
    : 1
  const n = dataState.scenes.length + 1

  const elements = {}
  for (const id of dataState.elementOrder) {
    const el    = dataState.elements[id]
    const proxy = elementProxies[id]
    if (el) elements[id] = { ...el, ...(proxy ? extractTweenableProps(proxy) : {}) }
  }

  const scene = {
    id: generateId('scene'),
    sequence,
    name: name ?? null,       // null = not user-named; display falls back to "Scene N"
    background: null,         // null = inherit from diagram; string = scene-specific override
    frame: (n - 1) * 60,
    elements,
    elementOrder: [...dataState.elementOrder],
    elementStates: Object.fromEntries(
      dataState.elementOrder
        .filter(id => elements[id])
        .map(id => [id, extractTweenableProps(elements[id])])
    ),
  }

  dataState.scenes.push(scene)

  clearTimeout(_toastTimer)
  captureToast.label = sceneLabel(scene)
  captureToast.visible = true
  _toastTimer = setTimeout(() => { captureToast.visible = false }, 2500)

  return scene
}

// Clone a scene and insert it immediately after the source in sequence order.
export function cloneScene(sourceId) {
  backfillSequences()
  // Work on a sequence-sorted view to find insertion point
  const sorted = [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const sourceIdx = sorted.findIndex(s => s.id === sourceId)
  if (sourceIdx < 0) return null
  const source = sorted[sourceIdx]

  const clone = {
    ...deepClone(source),
    id: generateId('scene'),
    name: source.name ? `${source.name} copy` : null,
    background: source.background ?? null, // explicit so undefined doesn't drop it
  }
  delete clone.sequence // will be assigned by renumberSequences

  // Insert directly after source in the sorted array, then splice into dataState
  sorted.splice(sourceIdx + 1, 0, clone)
  sorted.forEach((s, i) => { s.sequence = i + 1 })
  dataState.scenes.splice(0, dataState.scenes.length, ...sorted)

  return clone
}

export function updateSceneMeta(id, patch) {
  const scene = dataState.scenes.find(s => s.id === id)
  if (scene) Object.assign(scene, patch)
}

export function deleteScene(id) {
  if (uxState.activeSceneId === id) exitSceneEdit()
  const idx = dataState.scenes.findIndex(s => s.id === id)
  if (idx >= 0) {
    dataState.scenes.splice(idx, 1)
    renumberSequences()
  }
}

export function enterSceneEdit(sceneId) {
  const scene = dataState.scenes.find(s => s.id === sceneId)
  if (!scene) return

  pause()

  _savedElements     = deepClone(dataState.elements)
  _savedElementOrder = [...dataState.elementOrder]
  _savedKeyframes    = deepClone(dataState.keyframes)

  if (scene.elements && Object.keys(scene.elements).length > 0) {
    dataState.elements     = deepClone(scene.elements)
    dataState.elementOrder = [...(scene.elementOrder ?? dataState.elementOrder)]
  } else {
    dataState.elements     = deepClone(_savedElements)
    dataState.elementOrder = [..._savedElementOrder]
    for (const [id, state] of Object.entries(scene.elementStates ?? {})) {
      if (dataState.elements[id]) Object.assign(dataState.elements[id], state)
    }
  }

  syncProxies()

  uxState.activeSceneId  = sceneId
  uxState.storyboardMode = false
}

export function exitSceneEdit() {
  if (!uxState.activeSceneId) return
  const scene = dataState.scenes.find(s => s.id === uxState.activeSceneId)
  if (scene) {
    scene.elements     = deepClone(dataState.elements)
    scene.elementOrder = [...dataState.elementOrder]
    scene.elementStates = Object.fromEntries(
      dataState.elementOrder
        .filter(id => dataState.elements[id])
        .map(id => [id, extractTweenableProps(dataState.elements[id])])
    )
  }

  dataState.elements     = deepClone(_savedElements)
  dataState.elementOrder = [..._savedElementOrder]
  dataState.keyframes    = deepClone(_savedKeyframes)

  syncProxies()

  _savedElements     = {}
  _savedElementOrder = []
  _savedKeyframes    = {}
  uxState.activeSceneId = null
}

export function bakeScenesToTimeline() {
  const sorted = [...dataState.scenes].sort((a, b) => a.frame - b.frame)
  for (const scene of sorted) {
    for (const [elementId, props] of Object.entries(scene.elementStates ?? {})) {
      if (dataState.elements[elementId]) {
        addKeyframe(elementId, scene.frame, props)
      }
    }
  }
}
