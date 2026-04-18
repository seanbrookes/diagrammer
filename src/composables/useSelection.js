import uxState, { selectElement, clearSelection, clearDragState } from '../stores/uxState.js'
import dataState, { updateElement, addKeyframe } from '../stores/dataState.js'
import { elementProxies, syncProxyToElement } from '../stores/animationStore.js'
import { elementContains } from '../utils/geometry.js'
import { extractTweenableProps } from './useDrawing.js'

// Plain module-level variables — NOT reactive — so Vue can't mutate them mid-drag
let _dragOrigProps = null
let _dragStartPt = null
let _dragElementId = null
let _dragMode = 'move'
let _dragHandle = null

let marqueeStart = null
export const marquee = { active: false, x: 0, y: 0, width: 0, height: 0 }

function hitTest(svgPoint) {
  const order = [...dataState.elementOrder].reverse()
  for (const id of order) {
    const el = dataState.elements[id]
    if (el && !el.locked && el.visible !== false && elementContains(el, svgPoint)) return id
  }
  return null
}

function applyTranslation(elementId, origProps, dx, dy) {
  const el = dataState.elements[elementId]
  const proxy = elementProxies[elementId]
  if (!el || !proxy) return

  const patch = {}
  if ('x' in origProps)  { patch.x  = origProps.x  + dx; proxy.x  = patch.x }
  if ('y' in origProps)  { patch.y  = origProps.y  + dy; proxy.y  = patch.y }
  if ('cx' in origProps) { patch.cx = origProps.cx + dx; proxy.cx = patch.cx }
  if ('cy' in origProps) { patch.cy = origProps.cy + dy; proxy.cy = patch.cy }
  if ('x1' in origProps) { patch.x1 = origProps.x1 + dx; proxy.x1 = patch.x1 }
  if ('y1' in origProps) { patch.y1 = origProps.y1 + dy; proxy.y1 = patch.y1 }
  if ('x2' in origProps) { patch.x2 = origProps.x2 + dx; proxy.x2 = patch.x2 }
  if ('y2' in origProps) { patch.y2 = origProps.y2 + dy; proxy.y2 = patch.y2 }
  updateElement(elementId, patch)
}

function applyResize(elementId, origProps, dx, dy, handle) {
  const el = dataState.elements[elementId]
  const proxy = elementProxies[elementId]
  if (!el || !proxy || el.type !== 'rect') return

  const { x: ox, y: oy, width: ow, height: oh } = origProps
  const patch = {}

  if (handle.includes('e')) {
    patch.width = Math.max(10, ow + dx); proxy.width = patch.width
  }
  if (handle.includes('s')) {
    patch.height = Math.max(10, oh + dy); proxy.height = patch.height
  }
  if (handle.includes('w')) {
    const newWidth = Math.max(10, ow - dx)
    patch.x = ox + ow - newWidth; proxy.x = patch.x
    patch.width = newWidth; proxy.width = patch.width
  }
  if (handle.includes('n')) {
    const newHeight = Math.max(10, oh - dy)
    patch.y = oy + oh - newHeight; proxy.y = patch.y
    patch.height = newHeight; proxy.height = patch.height
  }
  updateElement(elementId, patch)
}

export function useSelection() {
  function onMouseDown(svgPoint, targetEl) {
    // Resize handle click
    const handle = targetEl?.dataset?.handle
    if (handle && uxState.selectedIds.length) {
      const id = uxState.selectedIds[0]
      const el = dataState.elements[id]
      // Snapshot as a plain frozen object — immune to Vue reactivity
      _dragOrigProps = Object.freeze({ ...el })
      _dragStartPt = { x: svgPoint.x, y: svgPoint.y }
      _dragElementId = id
      _dragMode = 'resize'
      _dragHandle = handle
      uxState.dragState.active = true
      return
    }

    // Element click
    const elementId = targetEl?.dataset?.elementId ?? hitTest(svgPoint)
    if (elementId) {
      selectElement(elementId, false)
      const el = dataState.elements[elementId]
      _dragOrigProps = Object.freeze({ ...el })
      _dragStartPt = { x: svgPoint.x, y: svgPoint.y }
      _dragElementId = elementId
      _dragMode = 'move'
      _dragHandle = null
      uxState.dragState.active = true
      return
    }

    // Empty canvas — marquee
    clearSelection()
    marqueeStart = { x: svgPoint.x, y: svgPoint.y }
    marquee.active = true
    marquee.x = svgPoint.x
    marquee.y = svgPoint.y
    marquee.width = 0
    marquee.height = 0
  }

  function onMouseMove(svgPoint) {
    if (uxState.dragState.active && _dragElementId) {
      const dx = svgPoint.x - _dragStartPt.x
      const dy = svgPoint.y - _dragStartPt.y
      if (_dragMode === 'move') {
        applyTranslation(_dragElementId, _dragOrigProps, dx, dy)
      } else if (_dragMode === 'resize') {
        applyResize(_dragElementId, _dragOrigProps, dx, dy, _dragHandle)
      }
      return
    }

    if (marquee.active && marqueeStart) {
      marquee.x = Math.min(marqueeStart.x, svgPoint.x)
      marquee.y = Math.min(marqueeStart.y, svgPoint.y)
      marquee.width = Math.abs(svgPoint.x - marqueeStart.x)
      marquee.height = Math.abs(svgPoint.y - marqueeStart.y)
    }
  }

  function onMouseUp() {
    if (uxState.dragState.active && _dragElementId) {
      const el = dataState.elements[_dragElementId]
      if (el) {
        const props = extractTweenableProps(el)
        addKeyframe(_dragElementId, Math.round(uxState.currentFrame), props)
        syncProxyToElement(_dragElementId)
      }
    }

    // Reset all drag state
    uxState.dragState.active = false
    _dragOrigProps = null
    _dragStartPt = null
    _dragElementId = null

    if (marquee.active) {
      marquee.active = false
      marqueeStart = null
    }
  }

  return { onMouseDown, onMouseMove, onMouseUp, marquee }
}
