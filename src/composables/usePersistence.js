import dataState, { loadProjectData, clearSessionData } from '../stores/dataState.js'
import { rebuildGsapTimeline, elementProxies, ensureProxy } from '../stores/animationStore.js'
import uxState from '../stores/uxState.js'

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function saveProject() {
  const payload = {
    version: '1.0',
    project: { ...dataState.project },
    elements: { ...dataState.elements },
    elementOrder: [...dataState.elementOrder],
    keyframes: { ...dataState.keyframes },
    groups: { ...dataState.groups },
    scenes: [...dataState.scenes],
  }
  downloadFile(JSON.stringify(payload, null, 2), `${dataState.project.name}.diagram.json`)
}

export function loadProject(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (!data.version || !data.elements) {
        alert('Invalid diagram file.')
        return
      }
      clearSessionData()
      loadProjectData({
        project: data.project,
        elements: data.elements,
        elementOrder: data.elementOrder,
        keyframes: data.keyframes,
        groups: data.groups,
        scenes: data.scenes,
      })
      uxState.selectedIds = []
      uxState.currentFrame = 0
      uxState.isPlaying = false
      uxState.sessionBg = ''

      // Ensure proxies exist for all loaded elements
      for (const id of data.elementOrder) ensureProxy(id)
      rebuildGsapTimeline()
    } catch (err) {
      alert('Failed to load diagram: ' + err.message)
    }
  }
  reader.readAsText(file)
}

export function openFilePicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.diagram.json'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) loadProject(file)
  }
  input.click()
}

export function exportSvg() {
  const svgEl = document.querySelector('#main-canvas')
  if (!svgEl) return
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  downloadFile(svgStr, `${dataState.project.name}.svg`)
}
