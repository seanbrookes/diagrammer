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
    const elementId = targetEl?.dataset?.elementId ?? hitTest(svgPoint)
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
        applyTranslationAll(dx, dy)
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
      const frame = Math.round(uxState.currentFrame)
      for (const id of Object.keys(_dragOrigPropsMap)) {
        const el = dataState.elements[id]
        if (el) {
          addKeyframe(id, frame, extractTweenableProps(el))
          syncProxyToElement(id)
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
