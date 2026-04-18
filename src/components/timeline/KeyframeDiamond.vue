<template>
  <g
    class="kf-diamond"
    :transform="`translate(${x}, 14)`"
    style="cursor: grab"
    @mousedown.stop="onMouseDown"
    @contextmenu.stop.prevent="onContextMenu"
  >
    <polygon points="0,-6 6,0 0,6 -6,0" :fill="selected ? '#e94560' : '#4a90e2'" stroke="#1a1a2e" stroke-width="1" />
  </g>

  <!-- Context menu -->
  <Teleport to="body">
    <div
      v-if="ctxMenu.visible"
      class="ctx-menu"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
    >
      <div class="ctx-title">Easing</div>
      <button
        v-for="ease in easings" :key="ease.value"
        class="ctx-item"
        :class="{ active: kf.easing === ease.value }"
        @click="setEasing(ease.value)"
      >{{ ease.label }}</button>
      <div class="ctx-divider" />
      <button class="ctx-item danger" @click="deleteKf">Delete keyframe</button>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, computed, onUnmounted } from 'vue'
import dataState, { moveKeyframe, removeKeyframe, updateKeyframe } from '../../stores/dataState.js'
import uxState from '../../stores/uxState.js'
import { seekToFrame } from '../../stores/animationStore.js'

const props = defineProps({
  kf: { type: Object, required: true },
  ppf: { type: Number, required: true },
})

const x = computed(() => props.kf.frame * props.ppf)
const selected = computed(() => Math.round(uxState.currentFrame) === props.kf.frame)

const ctxMenu = reactive({ visible: false, x: 0, y: 0 })

const easings = [
  { label: 'Linear', value: 'none' },
  { label: 'Ease In', value: 'power1.in' },
  { label: 'Ease Out', value: 'power1.out' },
  { label: 'Ease In/Out', value: 'power1.inOut' },
  { label: 'Strong In/Out', value: 'power3.inOut' },
  { label: 'Bounce Out', value: 'bounce.out' },
  { label: 'Elastic Out', value: 'elastic.out(1, 0.3)' },
  { label: 'Back In/Out', value: 'back.inOut(1.7)' },
]

function onMouseDown(e) {
  seekToFrame(props.kf.frame)
  const startX = e.clientX
  const startFrame = props.kf.frame

  const onMove = (me) => {
    const dx = me.clientX - startX
    const newFrame = Math.max(0, Math.round(startFrame + dx / props.ppf))
    moveKeyframe(props.kf.id, newFrame)
    seekToFrame(newFrame)
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onContextMenu(e) {
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.visible = true
  const close = () => { ctxMenu.visible = false; window.removeEventListener('click', close) }
  setTimeout(() => window.addEventListener('click', close), 10)
}

function setEasing(value) {
  updateKeyframe(props.kf.id, { easing: value })
  ctxMenu.visible = false
}

function deleteKf() {
  removeKeyframe(props.kf.id)
  ctxMenu.visible = false
}
</script>

<style scoped>
.kf-diamond { cursor: grab; }
.kf-diamond:active { cursor: grabbing; }
</style>

<style>
.ctx-menu {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
  z-index: 9999;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.ctx-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px 2px;
}

.ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 5px 8px;
  font-size: 12px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
}

.ctx-item:hover { background: var(--surface-2); }
.ctx-item.active { color: var(--accent); }
.ctx-item.danger { color: #f56565; }
.ctx-item.danger:hover { background: rgba(245,101,101,0.1); }

.ctx-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
</style>
