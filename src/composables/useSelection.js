import { reactive } from 'vue'
import uxState, { selectElement, clearSelection } from '../stores/uxState.js'
import dataState, { updateElement, addKeyframe, groupElements } from '../stores/dataState.js'
import { recordSnapshot } from './useHistory.js'
import { elementProxies, syncProxyToElement } from '../stores/animationStore.js'
import { elementContains, getBoundingBox, rectsIntersect } from '../utils/geometry.js'
import { collectSnapPoints, findNearestSnap, snapIndicator } from '../utils/snapPoints.js'
import { extractTweenableProps } from './useDrawing.js'
import { segmentsToDPath, closestTOnCubic, splitCubicSeg } from '../utils/penPath.js'

// Plain module-level variables — NOT reactive — immune to Vue mid-drag mutation
let _dragOrigPropsMap = {}   // { elementId: frozenProps } for all dragged elements
let _dragStartPt = null
let _dragElementId = null    // primary element (for resize/endpoint)
let _dragMode = 'move'       // 'move' | 'resize' | 'endpoint'
let _dragHandle = null
let _dragShift = false

let _marqueeStart = null
let _lastSnapTargetId = null   // set during endpoint drag when point-snap hits
let _dragPenBreakSmooth = false

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

  if (origProps.type === 'pen') {
    const segments = origProps.segments.map(s => ({
      ...s,
      x: s.x + dx,
      y: s.y + dy,
      cpIn:  s.cpIn  ? { x: s.cpIn.x  + dx, y: s.cpIn.y  + dy } : null,
      cpOut: s.cpOut ? { x: s.cpOut.x + dx, y: s.cpOut.y + dy } : null,
    }))
    const d = segmentsToDPath(segments, origProps.closed)
    const patch = { segments, d }
    Object.assign(proxy, patch)
    updateElement(elementId, patch)
    return
  }

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

function applyPenPointDrag(elementId, origProps, svgPoint, handle, shiftKey = false) {
  const proxy = elementProxies[elementId]
  if (!proxy) return

  const match = handle.match(/^(anchor|cp-out|cp-in)-(\d+)$/)
  if (!match) return
  const [, part, idxStr] = match
  const idx = parseInt(idxStr)

  const segments = origProps.segments.map(s => ({
    ...s,
    cpIn:  s.cpIn  ? { ...s.cpIn  } : null,
    cpOut: s.cpOut ? { ...s.cpOut } : null,
  }))
  const seg = segments[idx]
  const orig = origProps.segments[idx]
  if (!seg || !orig) return

  let nx = snapG(svgPoint.x)
  let ny = snapG(svgPoint.y)

  if (part === 'anchor') {
    if (shiftKey) {
      const ref = origProps.segments[idx - 1] ?? origProps.segments[idx + 1]
      if (ref) {
        const snapped = snapToAxis(ref.x, ref.y, nx, ny)
        nx = snapped.x; ny = snapped.y
      }
    }
    const ddx = nx - orig.x
    const ddy = ny - orig.y
    seg.x = nx
    seg.y = ny
    if (seg.cpIn)  { seg.cpIn.x  = orig.cpIn.x  + ddx; seg.cpIn.y  = orig.cpIn.y  + ddy }
    if (seg.cpOut) { seg.cpOut.x = orig.cpOut.x + ddx; seg.cpOut.y = orig.cpOut.y + ddy }
  } else if (part === 'cp-out') {
    seg.cpOut = { x: nx, y: ny }
    if (_dragPenBreakSmooth) {
      seg.smooth = false
    } else if (seg.smooth !== false && seg.cpIn) {
      seg.cpIn = { x: 2 * seg.x - nx, y: 2 * seg.y - ny }
    }
  } else if (part === 'cp-in') {
    seg.cpIn = { x: nx, y: ny }
    if (_dragPenBreakSmooth) {
      seg.smooth = false
    } else if (seg.smooth !== false && seg.cpOut) {
      seg.cpOut = { x: 2 * seg.x - nx, y: 2 * seg.y - ny }
    }
  }

  const d = segmentsToDPath(segments, origProps.closed)
  const patch = { segments, d }
  Object.assign(proxy, patch)
  updateElement(elementId, patch)
}

function togglePenAnchorSmooth(elementId, el, idx) {
  const segments = el.segments.map(s => ({
    ...s,
    cpIn:  s.cpIn  ? { ...s.cpIn  } : null,
    cpOut: s.cpOut ? { ...s.cpOut } : null,
  }))
  const seg = segments[idx]
  if (!seg) return

  if (seg.cpOut || seg.cpIn) {
    seg.cpIn  = null
    seg.cpOut = null
    seg.smooth = false
  } else {
    const prev = idx > 0 ? segments[idx - 1] : segments[segments.length - 1]
    const next = idx < segments.length - 1 ? segments[idx + 1] : segments[0]
    const ARM = 30
    if (prev !== seg && next !== seg) {
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      seg.cpOut = { x: seg.x + dx / len * ARM, y: seg.y + dy / len * ARM }
      seg.cpIn  = { x: seg.x - dx / len * ARM, y: seg.y - dy / len * ARM }
    } else if (next !== seg) {
      const dx = next.x - seg.x
      const dy = next.y - seg.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const scale = Math.min(ARM, len / 3)
      seg.cpOut = { x: seg.x + dx / len * scale, y: seg.y + dy / len * scale }
      seg.cpIn  = { x: seg.x - dx / len * scale, y: seg.y - dy / len * scale }
    }
    seg.smooth = true
  }

  const d = segmentsToDPath(segments, el.closed)
  const patch = { segments, d }
  const proxy = elementProxies[elementId]
  if (proxy) Object.assign(proxy, patch)
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

function removePenAnchor(elementId, el, idx) {
  if (el.segments.length <= 2) return
  const segments = el.segments
    .filter((_, i) => i !== idx)
    .map(s => ({ ...s, cpIn: s.cpIn ? { ...s.cpIn } : null, cpOut: s.cpOut ? { ...s.cpOut } : null }))
  const d = segmentsToDPath(segments, el.closed)
  const patch = { segments, d }
  const proxy = elementProxies[elementId]
  if (proxy) Object.assign(proxy, patch)
  updateElement(elementId, patch)
}

function insertPenAnchor(elementId, el, pt) {
  const segs = el.segments
  const n = segs.length
  const segCount = el.closed ? n : n - 1
  if (segCount < 1) return

  let bestT = 0.5, bestSegIdx = 0, bestDist = Infinity
  for (let i = 0; i < segCount; i++) {
    const a = segs[i]
    const b = segs[(i + 1) % n]
    const cp1 = a.cpOut ?? { x: a.x, y: a.y }
    const cp2 = b.cpIn  ?? { x: b.x, y: b.y }
    const { t, dist } = closestTOnCubic(pt, a, cp1, cp2, b)
    if (dist < bestDist) { bestDist = dist; bestSegIdx = i; bestT = t }
  }

  const newSegs = segs.map(s => ({
    ...s, cpIn: s.cpIn ? { ...s.cpIn } : null, cpOut: s.cpOut ? { ...s.cpOut } : null,
  }))
  const a = newSegs[bestSegIdx]
  const bIdx = (bestSegIdx + 1) % n
  const b = newSegs[bIdx]
  const cp1 = a.cpOut ?? { x: a.x, y: a.y }
  const cp2 = b.cpIn  ?? { x: b.x, y: b.y }
  const [newA, newMid, newB] = splitCubicSeg(a, cp1, cp2, b, bestT)
  newSegs[bestSegIdx] = newA
  newSegs[bIdx] = newB
  newSegs.splice(bestSegIdx + 1, 0, newMid)

  const d = segmentsToDPath(newSegs, el.closed)
  const patch = { segments: newSegs, d }
  const proxy = elementProxies[elementId]
  if (proxy) Object.assign(proxy, patch)
  updateElement(elementId, patch)
}

function deepFreezePen(el) {
  return Object.freeze({
    ...el,
    segments: el.segments.map(s => ({
      ...s,
      cpIn:  s.cpIn  ? { ...s.cpIn  } : null,
      cpOut: s.cpOut ? { ...s.cpOut } : null,
    })),
  })
}

export function useSelection() {
  function onMouseDown(svgPoint, targetEl) {
    const elTarget = targetEl?.closest?.('[data-id]') ?? targetEl
    const handle = targetEl?.dataset?.handle
    const penHandle = targetEl?.dataset?.penHandle

    // ── Pen edit mode ─────────────────────────────────────────────────────────
    if (uxState.editingPenId) {
      if (penHandle) {
        const elId = uxState.editingPenId
        const el = dataState.elements[elId]
        if (!el) { uxState.editingPenId = null; return }

        // Alt+click on anchor → remove that point
        if (targetEl?._altKey && penHandle.startsWith('anchor-')) {
          recordSnapshot()
          removePenAnchor(elId, el, parseInt(penHandle.slice(7)))
          return
        }

        // Ctrl+click on anchor → toggle smooth/corner
        if (targetEl?._ctrlKey && penHandle.startsWith('anchor-')) {
          recordSnapshot()
          togglePenAnchorSmooth(elId, el, parseInt(penHandle.slice(7)))
          return
        }

        // Alt+drag on cp handle → move independently (break smooth mirror)
        _dragPenBreakSmooth = !!(targetEl?._altKey && (penHandle.startsWith('cp-out-') || penHandle.startsWith('cp-in-')))

        recordSnapshot()
        _dragOrigPropsMap = { [elId]: deepFreezePen(el) }
        _dragStartPt = { x: svgPoint.x, y: svgPoint.y }
        _dragElementId = elId
        _dragMode = 'pen-point'
        _dragHandle = penHandle
        uxState.dragState.active = true
        return
      }

      // Alt+click on the path body → insert a new anchor at the closest point on the segment
      const clickedId = elTarget?.dataset?.id
      if (targetEl?._altKey && clickedId === uxState.editingPenId) {
        const el = dataState.elements[clickedId]
        if (el) { recordSnapshot(); insertPenAnchor(clickedId, el, svgPoint); return }
      }

      // Clicked outside pen handles → exit edit mode, fall through to normal selection
      uxState.editingPenId = null
    }

    // Endpoint handle (line/arrow p1 or p2)
    if ((handle === 'p1' || handle === 'p2') && uxState.selectedIds.length) {
      const id = uxState.selectedIds[0]
      const el = dataState.elements[id]
      recordSnapshot()
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
      recordSnapshot()
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
        for (const id of groupIds) selectElement(id, true)
      } else if (!uxState.selectedIds.includes(elementId)) {
        uxState.selectedIds = groupIds
      }
      // Deep-freeze pen elements so their segments snapshot is stable across the drag
      recordSnapshot()
      _dragOrigPropsMap = {}
      for (const id of uxState.selectedIds) {
        const el = dataState.elements[id]
        if (el) {
          _dragOrigPropsMap[id] = el.type === 'pen'
            ? deepFreezePen(el)
            : Object.freeze({ ...el })
        }
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
      } else if (_dragMode === 'pen-point') {
        applyPenPointDrag(_dragElementId, _dragOrigPropsMap[_dragElementId], svgPoint, _dragHandle, shiftKey)
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
    _dragPenBreakSmooth = false
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
