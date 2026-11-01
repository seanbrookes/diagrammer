const EXTENT = 9999

export function lineFromTwoPoints(p1, p2) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-9) return { a: 0, b: 1, c: -p1.y }
  const a = dy / len
  const b = -dx / len
  const c = -(a * p1.x + b * p1.y)
  return { a, b, c }
}

export function distancePointToLine(pt, line) {
  return Math.abs(line.a * pt.x + line.b * pt.y + line.c)
}

export function intersectLines(l1, l2) {
  const det = l1.a * l2.b - l2.a * l1.b
  if (Math.abs(det) < 1e-9) return null
  return {
    x: (-l1.c * l2.b + l2.c * l1.b) / det,
    y: (-l1.a * l2.c + l2.a * l1.c) / det,
  }
}

// Generate n fan lines radiating from vp, targeting evenly-spaced canvas perimeter points.
// Lines extend to ±EXTENT in world space (no canvas clipping).
export function generateFanLines(vp, W, H, n = 16) {
  const perim = 2 * (W + H)
  const step = perim / n
  const lines = []

  for (let i = 0; i < n; i++) {
    const pt = perimPointAt(i * step, W, H)
    const angle = Math.atan2(pt.y - vp.y, pt.x - vp.x)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    lines.push({
      x1: vp.x + cos * EXTENT,
      y1: vp.y + sin * EXTENT,
      x2: vp.x - cos * EXTENT,
      y2: vp.y - sin * EXTENT,
    })
  }
  return lines
}

// Horizon line through two VPs, extended to ±EXTENT. In 1pt mode, a horizontal at vp0.y.
export function horizonLine(vp0, vp1, mode) {
  if (mode === '1pt') {
    return { x1: -EXTENT, y1: vp0.y, x2: EXTENT, y2: vp0.y }
  }
  const dx = vp1.x - vp0.x
  const dy = vp1.y - vp0.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-9) return { x1: -EXTENT, y1: vp0.y, x2: EXTENT, y2: vp0.y }
  const nx = dx / len
  const ny = dy / len
  return {
    x1: vp0.x - nx * EXTENT,
    y1: vp0.y - ny * EXTENT,
    x2: vp0.x + nx * EXTENT,
    y2: vp0.y + ny * EXTENT,
  }
}

function perimPointAt(s, W, H) {
  if (s < W) return { x: s, y: 0 }
  s -= W
  if (s < H) return { x: W, y: s }
  s -= H
  if (s < W) return { x: W - s, y: H }
  s -= W
  return { x: 0, y: H - s }
}
