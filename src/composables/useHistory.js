import { reactive, toRaw } from 'vue'
import dataState from '../stores/dataState.js'
import {
  ensureProxy, removeProxy, syncProxyToElement,
  rebuildGsapTimeline, elementProxies,
} from '../stores/animationStore.js'

const MAX_HISTORY = 50

export const historyState = reactive({
  past: [],    // Array<snapshot> — pre-action states
  future: [],  // Array<snapshot> — for redo
})

// Deep-clone dataState into a plain serialisable object.
// Using a replacer that strips Vue Proxy wrappers at every level.
function capture() {
  const deproxy = (_, v) => (v !== null && typeof v === 'object') ? toRaw(v) : v
  return JSON.parse(JSON.stringify({
    elements:     dataState.elements,
    elementOrder: dataState.elementOrder,
    keyframes:    dataState.keyframes,
    groups:       dataState.groups,
    scenes:       dataState.scenes,
    project:      dataState.project,
  }, deproxy))
}

// Restore a snapshot into dataState and resync GSAP proxies.
function apply(snap) {
  dataState.elements     = { ...snap.elements }
  dataState.elementOrder = [...snap.elementOrder]
  dataState.keyframes    = { ...snap.keyframes }
  dataState.groups       = { ...snap.groups }
  dataState.scenes       = [...snap.scenes]
  Object.assign(dataState.project, snap.project)

  // Sync proxy list to restored element set
  for (const id of dataState.elementOrder) {
    ensureProxy(id)
    syncProxyToElement(id)
  }
  for (const id of Object.keys(elementProxies)) {
    if (!dataState.elements[id]) removeProxy(id)
  }
  rebuildGsapTimeline()
}

// Call this BEFORE any dataState mutation you want to make undoable.
// Clears the redo stack (new action branches the timeline).
export function recordSnapshot() {
  historyState.past.push(capture())
  if (historyState.past.length > MAX_HISTORY) historyState.past.shift()
  historyState.future = []
}

export function undo() {
  if (!historyState.past.length) return
  historyState.future.push(capture())   // save current state so redo works
  apply(historyState.past.pop())
}

export function redo() {
  if (!historyState.future.length) return
  historyState.past.push(capture())
  if (historyState.past.length > MAX_HISTORY) historyState.past.shift()
  apply(historyState.future.pop())
}

export const canUndo = () => historyState.past.length > 0
export const canRedo = () => historyState.future.length > 0
