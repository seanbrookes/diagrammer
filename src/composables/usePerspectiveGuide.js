import { computed } from 'vue'
import uxState from '../stores/uxState.js'
import dataState from '../stores/dataState.js'
import { generateFanLines, horizonLine } from '../utils/perspectiveMath.js'

export const perspGuide = uxState.perspectiveGuide

// Module-level drag offset — immune to Vue reactivity mid-drag (same pattern as useDrawing)
let _dragOffset = { x: 0, y: 0 }

export function startVpDrag(vpIndex, svgPoint) {
  const vp = uxState.perspectiveGuide.vps[vpIndex]
  _dragOffset = { x: svgPoint.x - vp.x, y: svgPoint.y - vp.y }
  uxState.perspectiveGuide.draggingVpIndex = vpIndex
}

export function moveVpDrag(svgPoint) {
  const i = uxState.perspectiveGuide.draggingVpIndex
  if (i === null) return
  uxState.perspectiveGuide.vps[i] = {
    x: svgPoint.x - _dragOffset.x,
    y: svgPoint.y - _dragOffset.y,
  }
}

export function endVpDrag() {
  uxState.perspectiveGuide.draggingVpIndex = null
}

const vpCount = computed(() => {
  const m = uxState.perspectiveGuide.mode
  return m === '1pt' ? 1 : m === '2pt' ? 2 : 3
})

export const activeVps = computed(() =>
  uxState.perspectiveGuide.vps.slice(0, vpCount.value)
)

export const fanLines = computed(() => {
  const pg = uxState.perspectiveGuide
  if (!pg.enabled) return []
  const { canvasWidth: W, canvasHeight: H } = dataState.project
  return activeVps.value.map((vp, vpIndex) => ({
    vpIndex,
    lines: generateFanLines(vp, W, H, 16),
  }))
})

export const horizonSeg = computed(() => {
  const pg = uxState.perspectiveGuide
  if (!pg.enabled) return null
  const vps = pg.vps
  return horizonLine(vps[0], vps[1], pg.mode)
})
