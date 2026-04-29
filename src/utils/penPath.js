function r(n) { return Math.round(n * 10) / 10 }

function lerp2(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function cubicAt(p0, cp1, cp2, p3, t) {
  const mt = 1 - t
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p3.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p3.y,
  }
}

// Numerically finds the parameter t in [0,1] on the cubic bezier closest to pt.
export function closestTOnCubic(pt, p0, cp1, cp2, p3) {
  let bestT = 0, bestDist = Infinity
  for (let i = 0; i <= 50; i++) {
    const t = i / 50
    const pos = cubicAt(p0, cp1, cp2, p3, t)
    const d = Math.hypot(pt.x - pos.x, pt.y - pos.y)
    if (d < bestDist) { bestDist = d; bestT = t }
  }
  // Refine with progressively smaller steps
  let step = 0.02
  for (let pass = 0; pass < 4; pass++) {
    step /= 5
    for (let dt = -step * 5; dt <= step * 5; dt += step) {
      const t = Math.max(0, Math.min(1, bestT + dt))
      const pos = cubicAt(p0, cp1, cp2, p3, t)
      const d = Math.hypot(pt.x - pos.x, pt.y - pos.y)
      if (d < bestDist) { bestDist = d; bestT = t }
    }
  }
  return { t: bestT, dist: bestDist }
}

// De Casteljau split of cubic bezier at t.
// Returns [updatedA, newMidpoint, updatedB] as full segment objects.
export function splitCubicSeg(aSeg, cp1, cp2, bSeg, t) {
  const p0 = { x: aSeg.x, y: aSeg.y }
  const p3 = { x: bSeg.x, y: bSeg.y }
  const q0 = lerp2(p0, cp1, t)
  const q1 = lerp2(cp1, cp2, t)
  const q2 = lerp2(cp2, p3, t)
  const r0 = lerp2(q0, q1, t)
  const r1 = lerp2(q1, q2, t)
  const s  = lerp2(r0, r1, t)
  const isCurve = !!(aSeg.cpOut || bSeg.cpIn)
  return [
    { ...aSeg, cpOut: isCurve ? q0 : null },
    { x: s.x, y: s.y, cpIn: isCurve ? r0 : null, cpOut: isCurve ? r1 : null, smooth: isCurve },
    { ...bSeg, cpIn: isCurve ? q2 : null },
  ]
}

export function segmentsToDPath(segments, closed = false) {
  if (!segments.length) return ''
  let d = `M ${r(segments[0].x)} ${r(segments[0].y)}`

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]
    const curr = segments[i]
    if (prev.cpOut || curr.cpIn) {
      const cp1 = prev.cpOut ?? { x: prev.x, y: prev.y }
      const cp2 = curr.cpIn ?? { x: curr.x, y: curr.y }
      d += ` C ${r(cp1.x)} ${r(cp1.y)} ${r(cp2.x)} ${r(cp2.y)} ${r(curr.x)} ${r(curr.y)}`
    } else {
      d += ` L ${r(curr.x)} ${r(curr.y)}`
    }
  }

  if (closed && segments.length > 1) {
    const last = segments[segments.length - 1]
    const first = segments[0]
    if (last.cpOut || first.cpIn) {
      const cp1 = last.cpOut ?? { x: last.x, y: last.y }
      const cp2 = first.cpIn ?? { x: first.x, y: first.y }
      d += ` C ${r(cp1.x)} ${r(cp1.y)} ${r(cp2.x)} ${r(cp2.y)} ${r(first.x)} ${r(first.y)}`
    }
    d += ' Z'
  }

  return d
}
