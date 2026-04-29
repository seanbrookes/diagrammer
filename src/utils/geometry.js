import { getTextBBox } from './textUtils.js'

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export function getBoundingBox(el) {
  switch (el.type) {
    case 'rect':
      return { x: el.x, y: el.y, width: el.width, height: el.height }
    case 'ellipse':
      return { x: el.cx - el.rx, y: el.cy - el.ry, width: el.rx * 2, height: el.ry * 2 }
    case 'line':
    case 'arrow': {
      const x = Math.min(el.x1, el.x2)
      const y = Math.min(el.y1, el.y2)
      return { x, y, width: Math.abs(el.x2 - el.x1), height: Math.abs(el.y2 - el.y1) }
    }
    case 'text':
      return getTextBBox(el)
    case 'path': {
      if (!el.points?.length) return { x: 0, y: 0, width: 0, height: 0 }
      const xs = el.points.map(p => p[0])
      const ys = el.points.map(p => p[1])
      const x = Math.min(...xs), y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
    case 'pen': {
      if (!el.segments?.length) return { x: 0, y: 0, width: 0, height: 0 }
      const xs = [], ys = []
      for (const s of el.segments) {
        xs.push(s.x); ys.push(s.y)
        if (s.cpIn)  { xs.push(s.cpIn.x);  ys.push(s.cpIn.y) }
        if (s.cpOut) { xs.push(s.cpOut.x); ys.push(s.cpOut.y) }
      }
      const x = Math.min(...xs), y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
    default:
      return { x: 0, y: 0, width: 0, height: 0 }
  }
}

export function pointInRect(pt, rect) {
  return (
    pt.x >= rect.x &&
    pt.x <= rect.x + rect.width &&
    pt.y >= rect.y &&
    pt.y <= rect.y + rect.height
  )
}

export function rectsIntersect(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  )
}

// Returns a unit outward-normal vector at pt on the surface of el.
// Used by the pen tool to orient tangent control arms on snap.
export function getSurfaceNormal(el, pt) {
  if (el.type === 'ellipse') {
    // Gradient of the implicit ellipse equation gives the exact outward normal.
    const dx = (pt.x - el.cx) / (el.rx * el.rx)
    const dy = (pt.y - el.cy) / (el.ry * el.ry)
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    return { x: dx / len, y: dy / len }
  }

  if (el.type === 'rect') {
    const { x, y, width: w, height: h } = el
    const dL = Math.abs(pt.x - x),       dR = Math.abs(pt.x - (x + w))
    const dT = Math.abs(pt.y - y),       dB = Math.abs(pt.y - (y + h))
    const minH = Math.min(dL, dR),       minV = Math.min(dT, dB)
    // Corner: two edges are equally close → diagonal
    if (Math.abs(minH - minV) < 2) {
      const nx = dL < dR ? -1 : 1, ny = dT < dB ? -1 : 1
      return { x: nx / Math.SQRT2, y: ny / Math.SQRT2 }
    }
    if (minH < minV) return { x: dL < dR ? -1 : 1, y: 0 }
    return { x: 0, y: dT < dB ? -1 : 1 }
  }

  if (el.type === 'line' || el.type === 'arrow') {
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const d1 = Math.hypot(pt.x - el.x1, pt.y - el.y1)
    const d2 = Math.hypot(pt.x - el.x2, pt.y - el.y2)
    // Outward = pointing away from the opposite endpoint
    return d1 < d2
      ? { x: -dx / len, y: -dy / len }
      : { x:  dx / len, y:  dy / len }
  }

  // Fallback: treat bounding box as a rect
  const bb = getBoundingBox(el)
  return getSurfaceNormal({ type: 'rect', x: bb.x, y: bb.y, width: bb.width, height: bb.height }, pt)
}

// Reasonable control-arm length for a tangent handle on a given shape.
export function tangentArmLength(el) {
  if (el.type === 'ellipse') return Math.max(20, Math.min(80, (el.rx + el.ry) * 0.35))
  if (el.type === 'rect')    return Math.max(20, Math.min(80, Math.min(el.width, el.height) * 0.25))
  return 40
}

export function elementContains(el, pt) {
  const bb = getBoundingBox(el)
  const padding = 6 // hit slop
  return pointInRect(pt, {
    x: bb.x - padding,
    y: bb.y - padding,
    width: bb.width + padding * 2,
    height: bb.height + padding * 2,
  })
}
