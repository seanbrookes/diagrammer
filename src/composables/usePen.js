import { reactive } from 'vue'
import uxState, { setTool } from '../stores/uxState.js'
import dataState, { addElement, addKeyframe } from '../stores/dataState.js'
import { ensureProxy, syncProxyToElement } from '../stores/animationStore.js'
import { generateId } from '../utils/idgen.js'
import { segmentsToDPath } from '../utils/penPath.js'
import { collectSnapPoints, findNearestSnap, snapIndicator } from '../utils/snapPoints.js'
import { extractTweenableProps } from './useDrawing.js'

const CLOSE_RADIUS = 8

// Module-level — not reactive, immune to Vue interference during drag
let _segments = []
let _isMouseDown = false
let _mouseDownPt = null

export const penState = reactive({
  active: false,
  segments: [],   // shallow copy for preview rendering
  mouseX: 0,
  mouseY: 0,
  isDragging: false,
  dragCpOut: null,
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

  const d = segmentsToDPath(_segments, closed)
  const penCount = Object.values(dataState.elements).filter(e => e.type === 'pen').length
  const el = {
    id: generateId('el'),
    type: 'pen',
    label: `Pen ${penCount + 1}`,
    segments: _segments.map(s => ({ ...s,
      cpIn: s.cpIn ? { ...s.cpIn } : null,
      cpOut: s.cpOut ? { ...s.cpOut } : null,
    })),
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
  penState.active = false
  penState.segments = []
  penState.isDragging = false
  penState.dragCpOut = null
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
    _isMouseDown = true
    _mouseDownPt = { x: snapped.x, y: snapped.y }

    // Click near first point → close path
    if (_segments.length >= 2) {
      if (dist(snapped, _segments[0]) < CLOSE_RADIUS) {
        commitPath(true)
        return
      }
    }

    _segments.push({ x: snapped.x, y: snapped.y, cpIn: null, cpOut: null })
    penState.active = true
    syncPreview()
  }

  function onMouseMove(pt) {
    // Snap cursor to nearest point when not dragging a handle
    const snapped = (!_isMouseDown) ? snapPt(pt) : pt
    penState.mouseX = snapped.x
    penState.mouseY = snapped.y

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
