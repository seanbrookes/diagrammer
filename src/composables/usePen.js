import { reactive } from 'vue'
import uxState, { setTool } from '../stores/uxState.js'
import dataState, { addElement, addKeyframe, updateElement } from '../stores/dataState.js'
import { recordSnapshot } from './useHistory.js'
import { ensureProxy, syncProxyToElement } from '../stores/animationStore.js'
import { generateId } from '../utils/idgen.js'
import { segmentsToDPath } from '../utils/penPath.js'
import { collectSnapPoints, findNearestSnap, snapIndicator } from '../utils/snapPoints.js'
import { extractTweenableProps } from './useDrawing.js'
import { getSurfaceNormal, tangentArmLength } from '../utils/geometry.js'

const CLOSE_RADIUS = 8

// Module-level — not reactive, immune to Vue interference during drag
let _segments = []
let _isMouseDown = false
let _mouseDownPt = null
let _extendingId = null  // id of existing pen element being extended

export const penState = reactive({
  active: false,
  segments: [],   // shallow copy for preview rendering
  mouseX: 0,
  mouseY: 0,
  isDragging: false,
  dragCpOut: null,
  extendTarget: null,  // {x,y} when hovering near an extendable endpoint
})

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function nextZIndex() {
  const els = Object.values(dataState.elements)
  return els.length ? Math.max(...els.map(e => e.zIndex ?? 0)) + 1 : 0
}

function syncPreview() {
  penState.segments = _segments.map(s => ({ ...s,
    cpIn: s.cpIn ? { ...s.cpIn } : null,
    cpOut: s.cpOut ? { ...s.cpOut } : null,
  }))
}

function commitPath(closed = false) {
  if (_segments.length < 2) { cancelPen(); return }
  recordSnapshot()

  const segments = _segments.map(s => ({ ...s,
    cpIn: s.cpIn ? { ...s.cpIn } : null,
    cpOut: s.cpOut ? { ...s.cpOut } : null,
  }))
  const d = segmentsToDPath(segments, closed)

  if (_extendingId) {
    updateElement(_extendingId, { segments, d, closed })
    syncProxyToElement(_extendingId)
    cancelPen()
    setTool('select')
    return
  }

  const penCount = Object.values(dataState.elements).filter(e => e.type === 'pen').length
  const el = {
    id: generateId('el'),
    type: 'pen',
    label: `Pen ${penCount + 1}`,
    segments,
    closed,
    d,
    stroke: '#333333',
    strokeWidth: 1,
    fill: 'none',
    opacity: 1,
    zIndex: nextZIndex(),
    locked: false,
    visible: true,
  }

  const added = addElement(el)
  ensureProxy(added.id)
  syncProxyToElement(added.id)
  addKeyframe(added.id, 0, extractTweenableProps(added))

  cancelPen()
  setTool('select')
}

export function cancelPen() {
  _segments = []
  _isMouseDown = false
  _mouseDownPt = null
  _extendingId = null
  penState.active = false
  penState.segments = []
  penState.isDragging = false
  penState.dragCpOut = null
  penState.extendTarget = null
  snapIndicator.active = false
}

export function usePen() {
  function snapPt(pt) {
    if (!uxState.pointSnap) return pt
    const candidates = collectSnapPoints(dataState.elements)
    const nearest = findNearestSnap(pt, candidates, 10, uxState.canvasZoom)
    if (nearest) {
      snapIndicator.active = true
      snapIndicator.x = nearest.x
      snapIndicator.y = nearest.y
      return nearest
    }
    snapIndicator.active = false
    return pt
  }

  function onMouseDown(pt) {
    const snapped = snapPt(pt)

    // Click near first point → close path
    if (_segments.length >= 2) {
      if (dist(snapped, _segments[0]) < CLOSE_RADIUS) {
        commitPath(true)
        return
      }
    }

    // No path in progress — check if clicking near an existing path's last endpoint to extend it
    if (_segments.length === 0) {
      const extendRadius = 16 / Math.max(0.25, uxState.canvasZoom)  // ~16 screen-px
      const penEls = Object.values(dataState.elements).filter(
        e => e.type === 'pen' && !e.closed && e.segments?.length >= 1
      )
      for (const el of penEls) {
        const lastSeg = el.segments[el.segments.length - 1]
        if (dist(snapped, lastSeg) < extendRadius) {
          _extendingId = el.id
          _segments = el.segments.map(s => ({
            ...s,
            cpIn:  s.cpIn  ? { ...s.cpIn  } : null,
            cpOut: s.cpOut ? { ...s.cpOut } : null,
          }))
          penState.active = true
          syncPreview()
          // Last existing segment is now the active anchor; don't add another
          _isMouseDown = true
          _mouseDownPt = { x: lastSeg.x, y: lastSeg.y }
          return
        }
      }
    }

    _isMouseDown = true
    _mouseDownPt = { x: snapped.x, y: snapped.y }

    // Force tangency: set cpIn/cpOut along the surface normal of the snapped shape
    let cpIn = null, cpOut = null
    if (uxState.forceTangency && snapped.elementId) {
      const target = dataState.elements[snapped.elementId]
      if (target) {
        const n   = getSurfaceNormal(target, snapped)
        const arm = tangentArmLength(target)
        cpIn  = { x: snapped.x - n.x * arm, y: snapped.y - n.y * arm }
        cpOut = { x: snapped.x + n.x * arm, y: snapped.y + n.y * arm }
      }
    }

    _segments.push({ x: snapped.x, y: snapped.y, cpIn, cpOut })
    penState.active = true
    syncPreview()
  }

  function onMouseMove(pt) {
    // Snap cursor to nearest point when not dragging a handle
    const snapped = (!_isMouseDown) ? snapPt(pt) : pt
    penState.mouseX = snapped.x
    penState.mouseY = snapped.y

    // Show hover ring when near an extendable endpoint (pen not yet active)
    if (_segments.length === 0 && !_isMouseDown) {
      const extendRadius = 16 / Math.max(0.25, uxState.canvasZoom)
      const penEls = Object.values(dataState.elements).filter(
        e => e.type === 'pen' && !e.closed && e.segments?.length >= 1
      )
      let found = null
      for (const el of penEls) {
        const lastSeg = el.segments[el.segments.length - 1]
        if (dist(snapped, lastSeg) < extendRadius) {
          found = { x: lastSeg.x, y: lastSeg.y }
          break
        }
      }
      penState.extendTarget = found
    } else if (!penState.active) {
      penState.extendTarget = null
    }

    if (_isMouseDown && _mouseDownPt && _segments.length > 0) {
      if (dist(pt, _mouseDownPt) > 3) {
        const last = _segments[_segments.length - 1]
        last.cpOut = { x: pt.x, y: pt.y }
        // Mirror cpIn so the anchor is smooth
        last.cpIn = { x: 2 * last.x - pt.x, y: 2 * last.y - pt.y }
        penState.isDragging = true
        penState.dragCpOut = { x: pt.x, y: pt.y }
        syncPreview()
      }
    }
  }

  function onMouseUp() {
    _isMouseDown = false
    _mouseDownPt = null
    penState.isDragging = false
    snapIndicator.active = false
  }

  // Double-click ends the path. The second click of the dblclick already added
  // a segment via onMouseDown, so pop it before committing.
  function onDblClick() {
    if (_segments.length > 1) _segments.pop()
    commitPath(false)
  }

  return { onMouseDown, onMouseMove, onMouseUp, onDblClick, penState }
}
