import { computed } from 'vue'
import uxState, { clearDrawState, setTool } from '../stores/uxState.js'
import dataState, { addElement, addKeyframe } from '../stores/dataState.js'
import { recordSnapshot } from './useHistory.js'
import { ensureProxy, syncProxyToElement } from '../stores/animationStore.js'
import { generateId } from '../utils/idgen.js'
import { rdpSimplify, pointsToPath } from '../utils/svgPath.js'

const DRAWING_TOOLS = ['rect', 'ellipse', 'line', 'arrow', 'text', 'path']

function nextZIndex() {
  const els = Object.values(dataState.elements)
  return els.length ? Math.max(...els.map(e => e.zIndex ?? 0)) + 1 : 0
}

function humanLabel(type) {
  const labels = {
    rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line',
    arrow: 'Arrow', text: 'Text', path: 'Path',
  }
  return `${labels[type] ?? type} ${Object.values(dataState.elements).filter(e => e.type === type).length + 1}`
}

const DEFAULT_FILL = { rect: '#a8d5a2', ellipse: '#a8d5a2', line: 'none', arrow: 'none', text: '#333333', path: 'none' }
const DEFAULT_STROKE = { rect: '#333333', ellipse: '#333333', line: '#333333', arrow: '#333333', text: 'none', path: '#333333' }

function commitShape() {
  recordSnapshot()
  const { startX, startY, currentX, currentY, points } = uxState.drawState
  const type = uxState.activeTool
  const zIndex = nextZIndex()
  const label = humanLabel(type)
  let el = { id: generateId('el'), type, label, zIndex, locked: false, visible: true }

  const minSize = 4

  if (type === 'rect') {
    const x = Math.min(startX, currentX)
    const y = Math.min(startY, currentY)
    const width = Math.max(minSize, Math.abs(currentX - startX))
    const height = Math.max(minSize, Math.abs(currentY - startY))
    Object.assign(el, { x, y, width, height, rx: 0, fill: DEFAULT_FILL.rect, stroke: DEFAULT_STROKE.rect, strokeWidth: 1, opacity: 1 })
  } else if (type === 'ellipse') {
    const cx = (startX + currentX) / 2
    const cy = (startY + currentY) / 2
    const rx = Math.max(minSize, Math.abs(currentX - startX) / 2)
    const ry = Math.max(minSize, Math.abs(currentY - startY) / 2)
    Object.assign(el, { cx, cy, rx, ry, fill: DEFAULT_FILL.ellipse, stroke: DEFAULT_STROKE.ellipse, strokeWidth: 1, opacity: 1 })
  } else if (type === 'line' || type === 'arrow') {
    Object.assign(el, {
      x1: startX, y1: startY, x2: currentX, y2: currentY,
      stroke: DEFAULT_STROKE.line, strokeWidth: 1, fill: 'none', opacity: 1,
      ...(type === 'arrow' ? { markerEnd: true, markerStart: false } : {}),
    })
  } else if (type === 'text') {
    Object.assign(el, {
      x: startX, y: startY, content: 'Text',
      fontSize: 16, fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 'normal', fill: DEFAULT_FILL.text, opacity: 1,
    })
  } else if (type === 'path') {
    const simplified = rdpSimplify(points.length > 2 ? points : points, 2.0)
    Object.assign(el, {
      d: pointsToPath(simplified),
      points: simplified,
      stroke: DEFAULT_STROKE.path, strokeWidth: 2, fill: 'none', opacity: 1,
    })
  }

  const added = addElement(el)
  ensureProxy(added.id)
  syncProxyToElement(added.id)

  // Auto-create keyframe at frame 0 with initial props
  const tweenableProps = extractTweenableProps(added)
  addKeyframe(added.id, 0, tweenableProps)

  return added
}

export function extractTweenableProps(el) {
  const NUMERIC_KEYS = ['x','y','width','height','rx','ry','cx','cy','x1','y1','x2','y2','opacity','strokeWidth','fontSize']
  const COLOR_KEYS = ['fill','stroke']
  const props = {}
  for (const k of NUMERIC_KEYS) {
    if (k in el && typeof el[k] === 'number') props[k] = el[k]
  }
  for (const k of COLOR_KEYS) {
    if (k in el && typeof el[k] === 'string') props[k] = el[k]
  }
  return props
}

export function useDrawing() {
  function onMouseDown(svgPoint) {
    if (!DRAWING_TOOLS.includes(uxState.activeTool)) return
    Object.assign(uxState.drawState, {
      active: true,
      startX: svgPoint.x, startY: svgPoint.y,
      currentX: svgPoint.x, currentY: svgPoint.y,
      points: [[svgPoint.x, svgPoint.y]],
    })
  }

  function onMouseMove(svgPoint, shiftKey = false) {
    if (!uxState.drawState.active) return
    let x = svgPoint.x
    let y = svgPoint.y
    if (shiftKey && (uxState.activeTool === 'line' || uxState.activeTool === 'arrow')) {
      const { startX, startY } = uxState.drawState
      const dx = x - startX
      const dy = y - startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      const snapped = Math.round(angle / 45) * 45
      const rad = snapped * Math.PI / 180
      x = startX + dist * Math.cos(rad)
      y = startY + dist * Math.sin(rad)
    }
    uxState.drawState.currentX = x
    uxState.drawState.currentY = y
    if (uxState.activeTool === 'path') {
      uxState.drawState.points.push([x, y])
    }
  }

  function onMouseUp() {
    if (!uxState.drawState.active) return
    if (uxState.activeTool !== 'text' || true) {
      commitShape()
    }
    clearDrawState()
    setTool('select')
  }

  // Ghost preview element during drawing
  const previewElement = computed(() => {
    const { active, startX, startY, currentX, currentY, points } = uxState.drawState
    if (!active || !DRAWING_TOOLS.includes(uxState.activeTool)) return null
    const type = uxState.activeTool

    if (type === 'rect') {
      return { type, x: Math.min(startX, currentX), y: Math.min(startY, currentY),
        width: Math.abs(currentX - startX), height: Math.abs(currentY - startY),
        fill: 'rgba(168,213,162,0.3)', stroke: '#333333', strokeWidth: 1.5, opacity: 1 }
    } else if (type === 'ellipse') {
      return { type, cx: (startX + currentX) / 2, cy: (startY + currentY) / 2,
        rx: Math.abs(currentX - startX) / 2, ry: Math.abs(currentY - startY) / 2,
        fill: 'rgba(168,213,162,0.3)', stroke: '#333333', strokeWidth: 1.5, opacity: 1 }
    } else if (type === 'line' || type === 'arrow') {
      return { type, x1: startX, y1: startY, x2: currentX, y2: currentY,
        stroke: '#333333', strokeWidth: 1, fill: 'none', opacity: 1,
        ...(type === 'arrow' ? { markerEnd: true } : {}) }
    } else if (type === 'path' && points.length > 1) {
      return { type, d: pointsToPath(points), stroke: '#333333', strokeWidth: 1.5, fill: 'none', opacity: 1 }
    } else if (type === 'text') {
      return { type, x: startX, y: startY, content: 'Text', fontSize: 16,
        fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 'normal', fill: '#333333', opacity: 0.5 }
    }
    return null
  })

  return { onMouseDown, onMouseMove, onMouseUp, previewElement }
}
