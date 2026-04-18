import { ref } from 'vue'

const past = ref([])
const future = ref([])

export const canUndo = () => past.value.length > 0
export const canRedo = () => future.value.length > 0

export function execute(command) {
  command.redo()
  past.value.push(command)
  future.value = []
}

export function undo() {
  const cmd = past.value.pop()
  if (cmd) {
    cmd.undo()
    future.value.push(cmd)
  }
}

export function redo() {
  const cmd = future.value.pop()
  if (cmd) {
    cmd.redo()
    past.value.push(cmd)
  }
}

// Command factories for common operations
import dataState, { addElement, removeElement, updateElement, addKeyframe, removeKeyframe } from '../stores/dataState.js'
import { ensureProxy, removeProxy, syncProxyToElement } from '../stores/animationStore.js'

export function cmdAddElement(element) {
  return {
    redo() {
      addElement(element)
      ensureProxy(element.id)
      syncProxyToElement(element.id)
    },
    undo() {
      removeElement(element.id)
      removeProxy(element.id)
    },
  }
}

export function cmdRemoveElement(id) {
  const snapshot = { ...dataState.elements[id] }
  const kfSnapshot = Object.values(dataState.keyframes)
    .filter(kf => kf.elementId === id)
    .map(kf => ({ ...kf }))
  return {
    redo() {
      removeElement(id)
      removeProxy(id)
    },
    undo() {
      addElement(snapshot)
      ensureProxy(snapshot.id)
      syncProxyToElement(snapshot.id)
      for (const kf of kfSnapshot) addKeyframe(kf.elementId, kf.frame, kf.props, kf.easing)
    },
  }
}

export function cmdUpdateElement(id, newPatch, oldPatch) {
  return {
    redo() { updateElement(id, newPatch); syncProxyToElement(id) },
    undo() { updateElement(id, oldPatch); syncProxyToElement(id) },
  }
}
