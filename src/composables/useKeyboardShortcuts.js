import { onMounted, onUnmounted } from 'vue'
import uxState, { setTool, clearSelection } from '../stores/uxState.js'
import dataState, {
  removeElement, addElement,
  groupElements, ungroupElements,
  bringToFront, bringForward, sendBackward, sendToBack,
} from '../stores/dataState.js'
import { elementProxies, removeProxy, seekToFrame, play, pause } from '../stores/animationStore.js'
import { updateElement, addKeyframe } from '../stores/dataState.js'
import { extractTweenableProps } from './useDrawing.js'
import { generateId } from '../utils/idgen.js'
import { undo, redo, recordSnapshot } from './useHistory.js'
import { saveProject } from './usePersistence.js'
import { cancelPen, penState } from './usePen.js'

export function useKeyboardShortcuts() {
  function deleteSelected() {
    if (!uxState.selectedIds.length) return
    recordSnapshot()
    for (const id of uxState.selectedIds) {
      removeElement(id)
      removeProxy(id)
    }
    clearSelection()
  }

  function duplicateSelected() {
    if (!uxState.selectedIds.length) return
    recordSnapshot()
    const newIds = []
    for (const id of uxState.selectedIds) {
      const el = dataState.elements[id]
      if (!el) continue
      const newEl = {
        ...el,
        id: generateId('el'),
        label: el.label + ' copy',
        x: (el.x ?? 0) + 20,
        y: (el.y ?? 0) + 20,
        cx: el.cx !== undefined ? el.cx + 20 : undefined,
        cy: el.cy !== undefined ? el.cy + 20 : undefined,
        x1: el.x1 !== undefined ? el.x1 + 20 : undefined,
        y1: el.y1 !== undefined ? el.y1 + 20 : undefined,
        x2: el.x2 !== undefined ? el.x2 + 20 : undefined,
        y2: el.y2 !== undefined ? el.y2 + 20 : undefined,
      }
      // Clean up undefined keys
      Object.keys(newEl).forEach(k => newEl[k] === undefined && delete newEl[k])
      addElement(newEl)
      newIds.push(newEl.id)
    }
    uxState.selectedIds = newIds
  }

  function nudgeSelected(dx, dy, isRepeat = false) {
    if (!uxState.selectedIds.length) return false
    if (!isRepeat) recordSnapshot()
    const frame = Math.round(uxState.currentFrame)
    for (const id of uxState.selectedIds) {
      const el = dataState.elements[id]
      const proxy = elementProxies[id]
      if (!el || !proxy) continue
      const patch = {}
      if ('x'  in el) { patch.x  = el.x  + dx; proxy.x  = patch.x }
      if ('y'  in el) { patch.y  = el.y  + dy; proxy.y  = patch.y }
      if ('cx' in el) { patch.cx = el.cx + dx; proxy.cx = patch.cx }
      if ('cy' in el) { patch.cy = el.cy + dy; proxy.cy = patch.cy }
      if ('x1' in el) { patch.x1 = el.x1 + dx; proxy.x1 = patch.x1 }
      if ('y1' in el) { patch.y1 = el.y1 + dy; proxy.y1 = patch.y1 }
      if ('x2' in el) { patch.x2 = el.x2 + dx; proxy.x2 = patch.x2 }
      if ('y2' in el) { patch.y2 = el.y2 + dy; proxy.y2 = patch.y2 }
      updateElement(id, patch)
      if (!uxState.activeSceneId)
        addKeyframe(id, frame, extractTweenableProps(dataState.elements[id]))
    }
    return true
  }

  function onKeyDown(e) {
    // Don't fire shortcuts when typing in inputs or textareas
    const tag = e.target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return

    const ctrl = e.ctrlKey || e.metaKey

    if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return }
    if (ctrl && e.key === 'y') { e.preventDefault(); redo(); return }
    if (ctrl && e.key === 'd') { e.preventDefault(); duplicateSelected(); return }
    if (ctrl && e.key === 's') { e.preventDefault(); saveProject(); return }
    if (ctrl && e.key === ']') {
      e.preventDefault()
      const id = uxState.selectedIds[0]
      if (id) { recordSnapshot(); e.shiftKey ? bringToFront(id) : bringForward(id) }
      return
    }
    if (ctrl && e.key === '[') {
      e.preventDefault()
      const id = uxState.selectedIds[0]
      if (id) { recordSnapshot(); e.shiftKey ? sendToBack(id) : sendBackward(id) }
      return
    }
    if (ctrl && e.key === 'g') {
      e.preventDefault()
      if (e.shiftKey && uxState.selectedIds.length) { recordSnapshot(); ungroupElements(uxState.selectedIds) }
      else if (uxState.selectedIds.length > 1) { recordSnapshot(); groupElements(uxState.selectedIds) }
      return
    }

    switch (e.key) {
      case 'v': case 'V': setTool('select'); break
      case 'r': case 'R': setTool('rect'); break
      case 'e': case 'E': setTool('ellipse'); break
      case 'l': case 'L': setTool('line'); break
      case 'a': case 'A': setTool('arrow'); break
      case 't': case 'T': setTool('text'); break
      case 'p': case 'P': setTool('path'); break
      case 'b': case 'B': setTool('pen'); break
      case 'c': case 'C': if (!e.ctrlKey && !e.metaKey) setTool('snapshot'); break
      case 'm': case 'M':
        if (!e.ctrlKey && !e.metaKey && !uxState.activeSceneId)
          uxState.storyboardMode = !uxState.storyboardMode
        break
      case 'Delete': case 'Backspace': deleteSelected(); break
      case 'Escape':
        if (uxState.editingPenId) { uxState.editingPenId = null; break }
        if (uxState.storyboardMode) { uxState.storyboardMode = false; break }
        if (uxState.activeSceneId) { uxState.storyboardMode = true; break }
        if (penState.active) cancelPen()
        setTool('select'); clearSelection(); break
      case ' ':
        e.preventDefault()
        uxState.isPlaying ? pause() : play()
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (!nudgeSelected(-1, 0, e.repeat))
          seekToFrame(Math.max(0, Math.round(uxState.currentFrame) - 1))
        break
      case 'ArrowRight':
        e.preventDefault()
        if (!nudgeSelected(1, 0, e.repeat))
          seekToFrame(Math.min(dataState.project.totalFrames, Math.round(uxState.currentFrame) + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        nudgeSelected(0, -1, e.repeat)
        break
      case 'ArrowDown':
        e.preventDefault()
        nudgeSelected(0, 1, e.repeat)
        break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
