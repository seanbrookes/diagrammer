function r(n) { return Math.round(n * 10) / 10 }

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
