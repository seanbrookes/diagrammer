import { reactive, computed, watch, toRaw } from 'vue'
import { generateId } from '../utils/idgen.js'
import { getBoundingBox } from '../utils/geometry.js'
import { pointsToPath } from '../utils/svgPath.js'
import { segmentsToDPath } from '../utils/penPath.js'

const SESSION_DATA_KEY = 'diagrammer_data'

function loadSessionData() {
  try {
    const raw = sessionStorage.getItem(SESSION_DATA_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const _session = loadSessionData()

const dataState = reactive({
  project: _session?.project ?? {
    id: generateId('proj'),
    name: 'Untitled',
    fps: 24,
    totalFrames: 240,
    canvasWidth: 1280,
    canvasHeight: 720,
    background: '#ffffff',
  },
  elements: _session?.elements ?? {},
  elementOrder: _session?.elementOrder ?? [],
  keyframes: _session?.keyframes ?? {},
  groups: _session?.groups ?? {},  // Record<groupId, { name }>
  scenes: _session?.scenes ?? [],  // Array<{ id, name, frame, elementStates }>
})

let _sessionSaveTimer = null
watch(
  dataState,
  () => {
    clearTimeout(_sessionSaveTimer)
    _sessionSaveTimer = setTimeout(() => {
      try {
        // replacer unwraps Vue reactive proxies at every level
        const deproxy = (_, v) => (v !== null && typeof v === 'object' ? toRaw(v) : v)
        sessionStorage.setItem(SESSION_DATA_KEY, JSON.stringify({
          project: dataState.project,
          elements: dataState.elements,
          elementOrder: dataState.elementOrder,
          keyframes: dataState.keyframes,
          groups: dataState.groups,
          scenes: dataState.scenes,
        }, deproxy))
      } catch { /* sessionStorage quota exceeded — silently skip */ }
    }, 500)
  },
  { deep: true }
)

export function flushSession() {
  clearTimeout(_sessionSaveTimer)
  try {
    const deproxy = (_, v) => (v !== null && typeof v === 'object' ? toRaw(v) : v)
    sessionStorage.setItem(SESSION_DATA_KEY, JSON.stringify({
      project: dataState.project,
      elements: dataState.elements,
      elementOrder: dataState.elementOrder,
      keyframes: dataState.keyframes,
      groups: dataState.groups,
      scenes: dataState.scenes,
    }, deproxy))
  } catch {}
}

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

export function bringToFront(id) {
  const idx = dataState.elementOrder.indexOf(id)
  if (idx < 0 || idx === dataState.elementOrder.length - 1) return
  const arr = [...dataState.elementOrder]
  arr.splice(idx, 1)
  arr.push(id)
  dataState.elementOrder = arr
}

export function sendToBack(id) {
  const idx = dataState.elementOrder.indexOf(id)
  if (idx <= 0) return
  const arr = [...dataState.elementOrder]
  arr.splice(idx, 1)
  arr.unshift(id)
  dataState.elementOrder = arr
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

// Flip transforms
function _flipElement(el, axis) {
  const bbox = getBoundingBox(el)
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  const mx = v => axis === 'h' ? 2 * cx - v : v
  const my = v => axis === 'v' ? 2 * cy - v : v

  if ('x1' in el) {
    const patch = { x1: mx(el.x1), y1: my(el.y1), x2: mx(el.x2), y2: my(el.y2) }
    if (el.type === 'arrow') { patch.markerEnd = el.markerStart; patch.markerStart = el.markerEnd }
    return patch
  }
  if (el.type === 'path' && el.points) {
    const pts = el.points.map(([px, py]) => [mx(px), my(py)])
    return { points: pts, d: pointsToPath(pts) }
  }
  if (el.type === 'pen' && el.segments) {
    const segs = el.segments.map(s => ({
      ...s,
      x: mx(s.x), y: my(s.y),
      cpIn:  s.cpIn  ? { x: mx(s.cpIn.x),  y: my(s.cpIn.y)  } : null,
      cpOut: s.cpOut ? { x: mx(s.cpOut.x), y: my(s.cpOut.y) } : null,
    }))
    return { segments: segs, d: segmentsToDPath(segs, el.closed) }
  }
  return {}
}

export function flipHorizontal(id) {
  const el = dataState.elements[id]
  if (el) updateElement(id, _flipElement(el, 'h'))
}

export function flipVertical(id) {
  const el = dataState.elements[id]
  if (el) updateElement(id, _flipElement(el, 'v'))
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

// Name uniqueness
export function makeUniqueName(desired, { excludeElementId = null, excludeGroupId = null } = {}) {
  const taken = new Set()
  for (const [id, el] of Object.entries(dataState.elements)) {
    if (id !== excludeElementId) taken.add((el.label ?? '').toLowerCase())
  }
  for (const [gid, g] of Object.entries(dataState.groups)) {
    if (gid !== excludeGroupId) taken.add((g.name ?? '').toLowerCase())
  }
  const base = (desired ?? '').trim() || 'Untitled'
  if (!taken.has(base.toLowerCase())) return base
  let i = 1
  while (taken.has(`${base}_${i}`.toLowerCase())) i++
  return `${base}_${i}`
}

export function renameElement(id, desired) {
  if (!dataState.elements[id]) return null
  const name = makeUniqueName(desired, { excludeElementId: id })
  dataState.elements[id].label = name
  return name
}

// Groups
export function groupElements(ids) {
  const groupId = generateId('grp')
  const name = makeUniqueName('Group')
  dataState.groups[groupId] = { name }
  for (const id of ids) {
    if (dataState.elements[id]) dataState.elements[id].groupId = groupId
  }
  return groupId
}

export function ungroupElements(ids) {
  const groupIds = new Set(ids.map(id => dataState.elements[id]?.groupId).filter(Boolean))
  for (const id of ids) {
    if (dataState.elements[id]) delete dataState.elements[id].groupId
  }
  for (const gid of groupIds) delete dataState.groups[gid]
}

export function setGroupName(groupId, desired) {
  if (!dataState.groups[groupId]) return null
  const name = makeUniqueName(desired, { excludeGroupId: groupId })
  dataState.groups[groupId].name = name
  return name
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
  dataState.groups = {}
  dataState.scenes = []
}

export function loadProjectData(data) {
  dataState.project = { ...data.project }
  dataState.elements = { ...data.elements }
  dataState.elementOrder = [...data.elementOrder]
  dataState.keyframes = { ...data.keyframes }
  dataState.groups = { ...(data.groups ?? {}) }
  dataState.scenes = [...(data.scenes ?? [])]
}

export function clearSessionData() {
  try { sessionStorage.removeItem(SESSION_DATA_KEY) } catch {}
}

export default dataState
