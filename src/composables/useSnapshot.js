import { reactive, nextTick } from 'vue'
import uxState, { setTool } from '../stores/uxState.js'
import { snapIndicator } from '../utils/snapPoints.js'

let _startPt = null

export const snapshotRect = reactive({ active: false, x: 0, y: 0, width: 0, height: 0 })

async function captureArea(svgEl, selection, zoom) {
  // Suppress UI overlays for a clean render
  const prevSelected = [...uxState.selectedIds]
  const prevSnap = snapIndicator.active
  uxState.selectedIds = []
  snapIndicator.active = false

  await nextTick()
  await new Promise(r => requestAnimationFrame(r))

  const svgStr = new XMLSerializer().serializeToString(svgEl)

  uxState.selectedIds = prevSelected
  snapIndicator.active = prevSnap

  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const img = new Image()
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url })
  URL.revokeObjectURL(url)

  // Use img.naturalWidth to get the actual rendered pixel size —
  // different browsers interpret SVG width attrs differently, so don't assume.
  const vb = svgEl.viewBox.baseVal
  const scale = img.naturalWidth / vb.width   // pixels per SVG user unit

  const full = document.createElement('canvas')
  full.width = img.naturalWidth
  full.height = img.naturalHeight
  full.getContext('2d').drawImage(img, 0, 0)   // 1:1, no scaling

  const px = Math.round(selection.x * scale)
  const py = Math.round(selection.y * scale)
  const pw = Math.max(1, Math.round(selection.width * scale))
  const ph = Math.max(1, Math.round(selection.height * scale))

  const cropped = document.createElement('canvas')
  cropped.width = pw
  cropped.height = ph
  cropped.getContext('2d').drawImage(full, px, py, pw, ph, 0, 0, pw, ph)

  return cropped.toDataURL('image/png')
}

export function useSnapshot(svgRef) {
  function onMouseDown(pt) {
    _startPt = { ...pt }
    snapshotRect.active = true
    snapshotRect.x = pt.x
    snapshotRect.y = pt.y
    snapshotRect.width = 0
    snapshotRect.height = 0
  }

  function onMouseMove(pt) {
    if (!_startPt) return
    snapshotRect.x = Math.min(_startPt.x, pt.x)
    snapshotRect.y = Math.min(_startPt.y, pt.y)
    snapshotRect.width = Math.abs(pt.x - _startPt.x)
    snapshotRect.height = Math.abs(pt.y - _startPt.y)
  }

  async function onMouseUp() {
    if (!_startPt) return
    const sel = { ...snapshotRect }
    snapshotRect.active = false
    _startPt = null

    if (sel.width < 4 || sel.height < 4) return

    const dataUrl = await captureArea(svgRef.value, sel, uxState.canvasZoom)

    // Force the img to display at the visual size of the selection (SVG units × zoom = CSS px)
    const displayW = Math.round(sel.width * uxState.canvasZoom)
    const displayH = Math.round(sel.height * uxState.canvasZoom)

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><title>Snapshot</title><style>
        body{margin:0;background:#111;display:flex;justify-content:center;padding:24px;box-sizing:border-box}
        img{display:block;box-shadow:0 4px 24px rgba(0,0,0,0.6)}
      </style></head><body><img src="${dataUrl}" width="${displayW}" height="${displayH}"></body></html>`)
      win.document.close()
    }

    setTool('select')
  }

  function onMouseLeave() {
    snapshotRect.active = false
    _startPt = null
  }

  return { onMouseDown, onMouseMove, onMouseUp, onMouseLeave }
}
