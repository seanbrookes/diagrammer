import { reactive, watch } from 'vue'

const STORAGE_KEY = 'diagrammer_ux'
const SESSION_KEY = 'diagrammer_session'

const defaults = {
  activeTool: 'select',
  selectedIds: [],
  currentFrame: 0,
  pixelsPerFrame: 4,
  canvasZoom: 1,
  canvasOffset: { x: 0, y: 0 },
  timelinePanelHeight: 220,
  isLooping: true,
  grid: { visible: false, spacing: 20, snap: false },
  pointSnap: false,
  autoGroupOnSnap: false,
  storyboardMode: false,
  activeSceneId: null,
  storyboardZoom: 1,
  sessionBg: '',  // overrides project.background for this tab session
  // transient — not persisted
  isPlaying: false,
  drawState: {
    active: false,
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    points: [],
  },
  dragState: {
    active: false,
    elementId: null,
    startPt: null,
    origProps: null,
    mode: 'move', // 'move' | 'resize'
    handle: null,
  },
  editingTextId: null,
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const saved = JSON.parse(raw)
    const allowed = ['pixelsPerFrame', 'canvasZoom', 'canvasOffset', 'timelinePanelHeight', 'isLooping', 'grid', 'pointSnap']
    return Object.fromEntries(allowed.filter(k => k in saved).map(k => [k, saved[k]]))
  } catch {
    return {}
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    const saved = JSON.parse(raw)
    const allowed = ['sessionBg']
    return Object.fromEntries(allowed.filter(k => k in saved).map(k => [k, saved[k]]))
  } catch {
    return {}
  }
}

const uxState = reactive({
  ...defaults,
  ...loadPersisted(),
  ...loadSession(),
})

const PERSIST_KEYS = ['pixelsPerFrame', 'canvasZoom', 'canvasOffset', 'timelinePanelHeight', 'isLooping', 'grid', 'pointSnap', 'autoGroupOnSnap', 'storyboardZoom']
const SESSION_KEYS = ['sessionBg']

watch(
  () => PERSIST_KEYS.map(k => uxState[k]),
  () => {
    const toSave = Object.fromEntries(PERSIST_KEYS.map(k => [k, uxState[k]]))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  },
  { deep: true }
)

watch(
  () => SESSION_KEYS.map(k => uxState[k]),
  () => {
    const toSave = Object.fromEntries(SESSION_KEYS.map(k => [k, uxState[k]]))
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(toSave))
  },
  { deep: true }
)

export function setTool(tool) {
  uxState.activeTool = tool
  clearDrawState()
}

export function selectElement(id, additive = false) {
  if (additive) {
    if (uxState.selectedIds.includes(id)) {
      uxState.selectedIds = uxState.selectedIds.filter(x => x !== id)
    } else {
      uxState.selectedIds = [...uxState.selectedIds, id]
    }
  } else {
    uxState.selectedIds = [id]
  }
}

export function clearSelection() {
  uxState.selectedIds = []
}

export function clearDrawState() {
  Object.assign(uxState.drawState, {
    active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, points: [],
  })
}

export function clearDragState() {
  Object.assign(uxState.dragState, {
    active: false, elementId: null, startPt: null, origProps: null, mode: 'move', handle: null,
  })
}

export default uxState
