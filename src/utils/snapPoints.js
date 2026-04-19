import { reactive } from 'vue'

// Shared snap indicator — rendered in SvgCanvas when active
export const snapIndicator = reactive({ active: false, x: 0, y: 0, elementId: null })

/**
 * Collect all snappable points from elements (excluding the ones being dragged).
 * Returns [{x, y}] representing corners, midpoints, endpoints, cardinal tangents.
 */
export function collectSnapPoints(elements, excludeIds = new Set()) {
  const points = []

  for (const el of Object.values(elements)) {
    if (excludeIds.has(el.id) || el.locked || el.visible === false) continue

    const id = el.id
    switch (el.type) {
      case 'line':
      case 'arrow':
        points.push({ x: el.x1, y: el.y1, elementId: id }, { x: el.x2, y: el.y2, elementId: id })
        break

      case 'rect': {
        const { x, y, width: w, height: h } = el
        points.push(
          { x,        y,        elementId: id },
          { x: x+w,   y,        elementId: id },
          { x: x+w,   y: y+h,   elementId: id },
          { x,        y: y+h,   elementId: id },
          { x: x+w/2, y,        elementId: id },
          { x: x+w,   y: y+h/2, elementId: id },
          { x: x+w/2, y: y+h,   elementId: id },
          { x,        y: y+h/2, elementId: id },
        )
        break
      }

      case 'ellipse':
        points.push(
          { x: el.cx + el.rx, y: el.cy,        elementId: id },
          { x: el.cx - el.rx, y: el.cy,        elementId: id },
          { x: el.cx,         y: el.cy - el.ry, elementId: id },
          { x: el.cx,         y: el.cy + el.ry, elementId: id },
        )
        break

      case 'path':
        if (el.points?.length) {
          const pts = el.points
          points.push(
            { x: pts[0][0],            y: pts[0][1],            elementId: id },
            { x: pts[pts.length-1][0], y: pts[pts.length-1][1], elementId: id },
          )
        }
        break

      case 'pen':
        if (el.segments?.length) {
          points.push({ x: el.segments[0].x, y: el.segments[0].y, elementId: id })
          if (!el.closed) {
            const last = el.segments[el.segments.length - 1]
            points.push({ x: last.x, y: last.y, elementId: id })
          }
        }
        break
    }
  }

  return points
}

/**
 * Returns the nearest snap point within threshold (SVG units), or null.
 * Pass threshold in screen pixels and canvasZoom to get zoom-independent feel.
 */
export function findNearestSnap(pt, snapPoints, thresholdPx = 10, zoom = 1) {
  const threshold = thresholdPx / zoom
  let nearest = null
  let minDist = threshold
  for (const sp of snapPoints) {
    const d = Math.sqrt((pt.x - sp.x) ** 2 + (pt.y - sp.y) ** 2)
    if (d < minDist) { minDist = d; nearest = sp }
  }
  return nearest
}
