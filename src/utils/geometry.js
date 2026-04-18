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
      return { x: el.x, y: el.y - (el.fontSize ?? 16), width: 120, height: el.fontSize ?? 16 }
    case 'path': {
      if (!el.points?.length) return { x: 0, y: 0, width: 0, height: 0 }
      const xs = el.points.map(p => p[0])
      const ys = el.points.map(p => p[1])
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
