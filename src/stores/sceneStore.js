import { reactive, toRaw } from 'vue'
import dataState, { addKeyframe } from './dataState.js'
import uxState from './uxState.js'
import { elementProxies, ensureProxy, removeProxy } from './animationStore.js'
import { extractTweenableProps } from '../composables/useDrawing.js'
import { generateId, generateShortId } from '../utils/idgen.js'
import { pause } from './animationStore.js'

function deepClone(obj) {
  // replacer unwraps Vue reactive proxies at every level before serialization
  return JSON.parse(JSON.stringify(obj, (_, v) => {
    if (v !== null && typeof v === 'object') return toRaw(v)
    return v
  }))
}

// Pre-scene-edit snapshots — restored in full on exit
let _savedElements    = {}
let _savedElementOrder = []
let _savedKeyframes   = {}

// Toast shown briefly after a scene is captured
export const captureToast = reactive({ visible: false, label: '' })
let _toastTimer = null

// Undo stack for scene deletions — each entry: { scene, sortedIdx }
export const deletedSceneStack = reactive([])

export function undoDeleteScene() {
  const entry = deletedSceneStack.pop()
  if (!entry) return
  const sorted = [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const insertAt = Math.min(entry.sortedIdx, sorted.length)
  sorted.splice(insertAt, 0, entry.scene)
  sorted.forEach((s, i) => { s.sequence = i + 1 })
  dataState.scenes.splice(0, dataState.scenes.length, ...sorted)
}

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

// Return the display label for a scene: stored name or short-id fallback for legacy null names
export function sceneLabel(scene) {
  return scene.name || `scene_${scene.id.slice(-4)}`
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
    if (!('background' in s)) s.background = null
  }
}

// Create a blank scene appended at the end and enter it immediately.
export function newScene() {
  backfillSequences()
  const sequence = dataState.scenes.length > 0
    ? Math.max(...dataState.scenes.map(s => s.sequence)) + 1
    : 1
  const scene = {
    id:           generateId('scene'),
    sequence,
    name:         `scene_${generateShortId()}`,
    background:   null,
    frame:        dataState.scenes.length * 60,
    elements:     {},
    elementOrder: [],
    elementStates: {},
  }
  dataState.scenes.push(scene)
  enterSceneEdit(scene.id)
  return scene
}

// Capture current canvas state as a new scene.
// When inside a scene, inserts immediately after it and inherits its background.
// When on the base canvas, appends to the end.
export function captureScene(name) {
  backfillSequences()

  const activeScene = uxState.activeSceneId
    ? dataState.scenes.find(s => s.id === uxState.activeSceneId) ?? null
    : null

  let sequence
  if (activeScene) {
    for (const s of dataState.scenes) {
      if ((s.sequence ?? 0) > activeScene.sequence) s.sequence++
    }
    sequence = activeScene.sequence + 1
  } else {
    sequence = dataState.scenes.length > 0
      ? Math.max(...dataState.scenes.map(s => s.sequence)) + 1
      : 1
  }

  const elements = {}
  for (const id of dataState.elementOrder) {
    const el    = dataState.elements[id]
    const proxy = elementProxies[id]
    if (el) elements[id] = { ...el, ...(proxy ? extractTweenableProps(proxy) : {}) }
  }

  const scene = {
    id: generateId('scene'),
    sequence,
    name: name ?? `scene_${generateShortId()}`,
    background: activeScene ? activeScene.background : null,
    frame: (dataState.scenes.length) * 60,
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

  // Sort first so insertion index is unambiguous
  const sorted = [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const sourceIdx = sorted.findIndex(s => s.id === sourceId)
  if (sourceIdx < 0) return null

  const src = sorted[sourceIdx]

  // Copy each field explicitly — avoids any proxy/serialization surprises
  const clone = {
    id:             generateId('scene'),
    sequence:       0,             // assigned below
    name:           `scene_${generateShortId()}`,
    background:     src.background,
    frame:          src.frame,
    elements:       JSON.parse(JSON.stringify(src.elements   || {})),
    elementOrder:   [...(src.elementOrder  || [])],
    elementStates:  JSON.parse(JSON.stringify(src.elementStates || {})),
  }

  // Insert clone after source, then reassign sequences 1..N
  sorted.splice(sourceIdx + 1, 0, clone)
  sorted.forEach((s, i) => { s.sequence = i + 1 })

  // Replace scenes array in one shot so Vue sees a single reactive update
  dataState.scenes.splice(0, dataState.scenes.length, ...sorted)

  return clone
}

export function updateSceneMeta(id, patch) {
  const scene = dataState.scenes.find(s => s.id === id)
  if (scene) Object.assign(scene, patch)
}

export function deleteScene(id) {
  const wasActive = uxState.activeSceneId === id

  // Find the sorted neighbour to land on before we touch anything
  const sorted = [...dataState.scenes].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const sortedIdx = sorted.findIndex(s => s.id === id)
  const landOn = wasActive
    ? (sorted[sortedIdx + 1] ?? sorted[sortedIdx - 1] ?? null)
    : null

  if (wasActive) exitSceneEdit()

  const idx = dataState.scenes.findIndex(s => s.id === id)
  if (idx < 0) return

  deletedSceneStack.push({ scene: deepClone(dataState.scenes[idx]), sortedIdx })
  dataState.scenes.splice(idx, 1)
  renumberSequences()

  // Re-enter the nearest scene so the UI stays in scene-edit mode
  if (landOn && dataState.scenes.find(s => s.id === landOn.id)) {
    enterSceneEdit(landOn.id)
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
