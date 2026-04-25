import { reactive } from 'vue'
import uxState, { selectElement, clearSelection } from '../stores/uxState.js'
import dataState, { updateElement, addKeyframe, groupElements } from '../stores/dataState.js'
import { elementProxies, syncProxyToElement } from '../stores/animationStore.js'
import { elementContains, getBoundingBox, rectsIntersect } from '../utils/geometry.js'
import { collectSnapPoints, findNearestSnap, snapIndicator } from '../utils/snapPoints.js'
import { extractTweenableProps } from './useDrawing.js'

// Plain module-level variables — NOT reactive — immune to Vue mid-drag mutation
let _dragOrigPropsMap = {}   // { elementId: frozenProps } for all dragged elements
let _dragStartPt = null
let _dragElementId = null    // primary element (for resize/endpoint)
let _dragMode = 'move'       // 'move' | 'resize' | 'endpoint'
let _dragHandle = null
let _dragShift = false

let _marqueeStart = null
let _lastSnapTargetId = null   // set during endpoint drag when point-snap hits

// Reactive so the SVG canvas re-renders the marquee rect as the mouse moves
export const marquee = reactive({ active: false, x: 0, y: 0, width: 0, height: 0 })

function snapG(v) {
  if (!uxState.grid?.snap) return v
  const s = uxState.grid.spacing
  return Math.round(v / s) * s
}

// Return the 6 alignment edges for a bounding box
function alignEdges(bb) {
  return {
    left:   bb.x,
    right:  bb.x + bb.width,
    cx:     bb.x + bb.width / 2,
    top:    bb.y,
    bottom: bb.y + bb.height,
    cy:     bb.y + bb.height / 2,
  }
}

// Bounding box of a single element's origProps after applying dx/dy
function movedBB(orig, dx, dy) {
  const m = { ...orig }
  if ('x'  in m) m.x  = orig.x  + dx
  if ('y'  in m) m.y  = orig.y  + dy
  if ('cx' in m) m.cx = orig.cx + dx
  if ('cy' in m) m.cy = orig.cy + dy
  if ('x1' in m) { m.x1 = orig.x1 + dx; m.y1 = orig.y1 + dy }
  if ('x2' in m) { m.x2 = orig.x2 + dx; m.y2 = orig.y2 + dy }
  return getBoundingBox(m)
}

// Compute alignment guides and optional snap corrections for a move drag.
// Returns { guides, snapDx, snapDy }.
function computeAlignGuides(dx, dy) {
  const draggedIds = new Set(Object.keys(_dragOrigPropsMap))
  const threshold  = 5 / (uxState.canvasZoom || 1)

  // Merge all dragged element bounding boxes at current dx/dy
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const orig of Object.values(_dragOrigPropsMap)) {
    const b = movedBB(orig, dx, dy)
    minX = Math.min(minX, b.x);  maxX = Math.max(maxX, b.x + b.width)
    minY = Math.min(minY, b.y);  maxY = Math.max(maxY, b.y + b.height)
  }
  const dEdges = alignEdges({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })

  const guides    = []
  const seenX     = new Set()
  const seenY     = new Set()
  let xCorrection = null, xDist = Infinity
  let yCorrection = null, yDist = Infinity

  const D_KEYS_X = ['left', 'right', 'cx']
  const D_KEYS_Y = ['top',  'bottom', 'cy']

  for (const id of dataState.elementOrder) {
    if (draggedIds.has(id)) continue
    const el = dataState.elements[id]
    if (!el || el.locked || el.visible === false) continue
    const sEdges = alignEdges(getBoundingBox(el))

    for (const dk of D_KEYS_X) {
      for (const sk of D_KEYS_X) {
        const dist = Math.abs(dEdges[dk] - sEdges[sk])
        if (dist < threshold) {
          const pos = sEdges[sk]
          if (!seenX.has(pos)) { seenX.add(pos); guides.push({ axis: 'x', pos }) }
          if (dist < xDist) { xDist = dist; xCorrection = sEdges[sk] - dEdges[dk] }
        }
      }
    }
    for (const dk of D_KEYS_Y) {
      for (const sk of D_KEYS_Y) {
        const dist = Math.abs(dEdges[dk] - sEdges[sk])
        if (dist < threshold) {
          const pos = sEdges[sk]
          if (!seenY.has(pos)) { seenY.add(pos); guides.push({ axis: 'y', pos }) }
          if (dist < yDist) { yDist = dist; yCorrection = sEdges[sk] - dEdges[dk] }
        }
      }
    }
  }

  return {
    guides,
    snapDx: xCorrection ?? 0,
    snapDy: yCorrection ?? 0,
  }
}

function expandGroup(elementId) {
  const el = dataState.elements[elementId]
  if (!el?.groupId) return [elementId]
  return dataState.elementOrder.filter(id => dataState.elements[id]?.groupId === el.groupId)
}

function hitTest(svgPoint) {
  const order = [...dataState.elementOrder].reverse()
  for (const id of order) {
    const el = dataState.elements[id]
    if (el && !el.locked && el.visible !== false && elementContains(el, svgPoint)) return id
  }
  return null
}

function marqueeSelect() {
  const hits = []
  for (const id of dataState.elementOrder) {
    const el = dataState.elements[id]
    if (!el || el.locked || el.visible === false) continue
    const bbox = getBoundingBox(el)
    if (rectsIntersect(marquee, bbox)) hits.push(id)
  }
  if (hits.length) {
    uxState.selectedIds = hits
  }
}

function applyTranslationOne(elementId, origProps, dx, dy) {
  const proxy = elementProxies[elementId]
  if (!proxy) return

  const patch = {}
  if ('x' in origProps)  { patch.x  = snapG(origProps.x  + dx); proxy.x  = patch.x }
  if ('y' in origProps)  { patch.y  = snapG(origProps.y  + dy); proxy.y  = patch.y }
  if ('cx' in origProps) { patch.cx = snapG(origProps.cx + dx); proxy.cx = patch.cx }
  if ('cy' in origProps) { patch.cy = snapG(origProps.cy + dy); proxy.cy = patch.cy }
  if ('x1' in origProps) { patch.x1 = snapG(origProps.x1 + dx); proxy.x1 = patch.x1 }
  if ('y1' in origProps) { patch.y1 = snapG(origProps.y1 + dy); proxy.y1 = patch.y1 }
  if ('x2' in origProps) { patch.x2 = snapG(origProps.x2 + dx); proxy.x2 = patch.x2 }
  if ('y2' in origProps) { patch.y2 = snapG(origProps.y2 + dy); proxy.y2 = patch.y2 }
  updateElement(elementId, patch)
}

function applyTranslationAll(dx, dy) {
  for (const [id, origProps] of Object.entries(_dragOrigPropsMap)) {
    applyTranslationOne(id, origProps, dx, dy)
  }
}

function snapToAxis(fx, fy, mx, my) {
  const dx = mx - fx
  const dy = my - fy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  const snapped = Math.round(angle / 45) * 45
  const rad = snapped * Math.PI / 180
  return { x: fx + dist * Math.cos(rad), y: fy + dist * Math.sin(rad) }
}

function applyEndpoint(elementId, origProps, svgPoint, handle, shift) {
  const proxy = elementProxies[elementId]
  if (!proxy) return

  let mx = svgPoint.x
  let my = svgPoint.y

  if (shift) {
    const fx = handle === 'p1' ? origProps.x2 : origProps.x1
    const fy = handle === 'p1' ? origProps.y2 : origProps.y1
    const snapped = snapToAxis(fx, fy, mx, my)
    mx = snapped.x
    my = snapped.y
  }

  mx = snapG(mx)
  my = snapG(my)

  // Point snap (endpoint → nearest snappable point on other elements)
  if (uxState.pointSnap) {
    const candidates = collectSnapPoints(dataState.elements, new Set([elementId]))
    const nearest = findNearestSnap({ x: mx, y: my }, candidates, 10, uxState.canvasZoom)
    if (nearest) {
      mx = nearest.x
      my = nearest.y
      snapIndicator.active = true
      snapIndicator.x = nearest.x
      snapIndicator.y = nearest.y
      snapIndicator.elementId = nearest.elementId
      _lastSnapTargetId = nearest.elementId
    } else {
      snapIndicator.active = false
      snapIndicator.elementId = null
      _lastSnapTargetId = null
    }
  }

  const patch = handle === 'p1'
    ? { x1: mx, y1: my }
    : { x2: mx, y2: my }

  Object.assign(proxy, patch)
  updateElement(elementId, patch)
}

function applyResize(elementId, origProps, dx, dy, handle) {
  const el = dataState.elements[elementId]
  const proxy = elementProxies[elementId]
  if (!el || !proxy || el.type !== 'rect') return

  const { x: ox, y: oy, width: ow, height: oh } = origProps
  const patch = {}

  if (handle.includes('e')) {
    const right = snapG(ox + ow + dx)
    patch.width = Math.max(10, right - ox); proxy.width = patch.width
  }
  if (handle.includes('s')) {
    const bottom = snapG(oy + oh + dy)
    patch.height = Math.max(10, bottom - oy); proxy.height = patch.height
  }
  if (handle.includes('w')) {
    const left = snapG(ox + dx)
    patch.x = Math.min(left, ox + ow - 10); proxy.x = patch.x
    patch.width = ox + ow - patch.x; proxy.width = patch.width
  }
  if (handle.includes('n')) {
    const top = snapG(oy + dy)
    patch.y = Math.min(top, oy + oh - 10); proxy.y = patch.y
    patch.height = oy + oh - patch.y; proxy.height = patch.height
  }
  updateElement(elementId, patch)
}

export function useSelection() {
  function onMouseDown(svgPoint, targetEl) {
    const elTarget = targetEl?.closest?.('[data-id]') ?? targetEl
    const handle = targetEl?.dataset?.handle

    // Endpoint handle (line/arrow p1 or p2)
    if ((handle === 'p1' || handle === 'p2') && uxState.selectedIds.length) {
      const id = uxState.selectedIds[0]
      const el = dataState.elements[id]
      _dragOrigPropsMap = { [id]: Object.freeze({ ...el }) }
      _dragStartPt = { x: svgPoint.x, y: svgPoint.y }
      _dragElementId = id
      _dragMode = 'endpoint'
      _dragHandle = handle
      _dragShift = targetEl?._shiftKey ?? false
      _lastSnapTargetId = null
      uxState.dragState.active = true
      return
    }

    // Resize handle (rect corners/edges)
    if (handle && uxState.selectedIds.length) {
      const id = uxState.selectedIds[0]
      const el = dataState.elements[id]
      _dragOrigPropsMap = { [id]: Object.freeze({ ...el }) }
      _dragStartPt = { x: svgPoint.x, y: svgPoint.y }
      _dragElementId = id
      _dragMode = 'resize'
      _dragHandle = handle
      _dragShift = false
      uxState.dragState.active = true
      return
    }

    // Element click — shift-click adds to selection
    const elementId = elTarget?.dataset?.id ?? hitTest(svgPoint)
    if (elementId) {
      const shift = targetEl?._shiftKey ?? false

      const groupIds = expandGroup(elementId)
      if (shift) {
        // Shift-click toggles the whole group
        for (const id of groupIds) selectElement(id, true)
      } else if (!uxState.selectedIds.includes(elementId)) {
        // Select entire group at once
        uxState.selectedIds = groupIds
      }
      // Snapshot origProps for every selected element
      _dragOrigPropsMap = {}
      for (const id of uxState.selectedIds) {
        const el = dataState.elements[id]
        if (el) _dragOrigPropsMap[id] = Object.freeze({ ...el })
      }
      _dragStartPt = { x: svgPoint.x, y: svgPoint.y }
      _dragElementId = elementId
      _dragMode = 'move'
      _dragHandle = null
      uxState.dragState.active = true
      return
    }

    // Empty canvas — start marquee
    clearSelection()
    _marqueeStart = { x: svgPoint.x, y: svgPoint.y }
    marquee.active = true
    marquee.x = svgPoint.x
    marquee.y = svgPoint.y
    marquee.width = 0
    marquee.height = 0
  }

  function onMouseMove(svgPoint, shiftKey = false) {
    if (uxState.dragState.active && _dragElementId) {
      const dx = svgPoint.x - _dragStartPt.x
      const dy = svgPoint.y - _dragStartPt.y
      if (_dragMode === 'move') {
        const { guides, snapDx, snapDy } = computeAlignGuides(dx, dy)
        uxState.alignGuides = guides
        applyTranslationAll(dx + snapDx, dy + snapDy)
      } else if (_dragMode === 'resize') {
        applyResize(_dragElementId, _dragOrigPropsMap[_dragElementId], dx, dy, _dragHandle)
      } else if (_dragMode === 'endpoint') {
        _dragShift = shiftKey
        applyEndpoint(_dragElementId, _dragOrigPropsMap[_dragElementId], svgPoint, _dragHandle, _dragShift)
      }
      return
    }

    if (marquee.active && _marqueeStart) {
      marquee.x = Math.min(_marqueeStart.x, svgPoint.x)
      marquee.y = Math.min(_marqueeStart.y, svgPoint.y)
      marquee.width = Math.abs(svgPoint.x - _marqueeStart.x)
      marquee.height = Math.abs(svgPoint.y - _marqueeStart.y)
    }
  }

  function onMouseUp() {
    if (uxState.dragState.active && Object.keys(_dragOrigPropsMap).length) {
      // In scene edit mode, skip keyframe creation — exitSceneEdit captures the state
      if (!uxState.activeSceneId) {
        const frame = Math.round(uxState.currentFrame)
        for (const id of Object.keys(_dragOrigPropsMap)) {
          const el = dataState.elements[id]
          if (el) {
            addKeyframe(id, frame, extractTweenableProps(el))
            syncProxyToElement(id)
          }
        }
      }
    }

    // Auto-group on snap: merge line/arrow with the element it snapped to
    if (
      _dragMode === 'endpoint' &&
      uxState.autoGroupOnSnap &&
      _dragElementId &&
      _lastSnapTargetId &&
      _lastSnapTargetId !== _dragElementId
    ) {
      const lineEl   = dataState.elements[_dragElementId]
      const targetEl = dataState.elements[_lastSnapTargetId]
      if (lineEl && targetEl) {
        const lineGroup   = lineEl.groupId   ?? null
        const targetGroup = targetEl.groupId ?? null

        if (lineGroup && targetGroup && lineGroup === targetGroup) {
          // already in same group — no-op
        } else if (lineGroup && targetGroup && lineGroup !== targetGroup) {
          // merge targetGroup into lineGroup
          for (const id of dataState.elementOrder) {
            const el = dataState.elements[id]
            if (el?.groupId === targetGroup) {
              dataState.elements[id] = { ...el, groupId: lineGroup }
            }
          }
          delete dataState.groups[targetGroup]
        } else if (lineGroup) {
          // add target to line's existing group
          dataState.elements[_lastSnapTargetId] = { ...targetEl, groupId: lineGroup }
        } else if (targetGroup) {
          // add line to target's existing group
          dataState.elements[_dragElementId] = { ...lineEl, groupId: targetGroup }
        } else {
          // create a new group for both
          groupElements([_dragElementId, _lastSnapTargetId])
        }
      }
    }

    uxState.dragState.active = false
    uxState.alignGuides = []
    _dragOrigPropsMap = {}
    _dragStartPt = null
    _dragElementId = null
    _lastSnapTargetId = null
    snapIndicator.active = false
    snapIndicator.elementId = null

    if (marquee.active) {
      marqueeSelect()
      marquee.active = false
      _marqueeStart = null
    }
  }

  return { onMouseDown, onMouseMove, onMouseUp, marquee }
}
