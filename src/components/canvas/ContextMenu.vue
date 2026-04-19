<template>
  <Teleport to="body">
    <div
      class="context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @mousedown.stop
    >
      <template v-if="hasSelection">
        <button class="cm-item" @click="act('flipH')">Flip Horizontal</button>
        <button class="cm-item" @click="act('flipV')">Flip Vertical</button>
        <div class="cm-divider" />
        <button class="cm-item" @click="act('bringToFront')">
          Bring to Front <span class="cm-hint">⌘⇧]</span>
        </button>
        <button class="cm-item" @click="act('bringForward')">
          Move Up <span class="cm-hint">⌘]</span>
        </button>
        <button class="cm-item" @click="act('sendBackward')">
          Move Down <span class="cm-hint">⌘[</span>
        </button>
        <button class="cm-item" @click="act('sendToBack')">
          Send to Back <span class="cm-hint">⌘⇧[</span>
        </button>
        <div class="cm-divider" />
        <button v-if="canGroup"   class="cm-item" @click="act('group')">Group <span class="cm-hint">⌘G</span></button>
        <button v-if="canUngroup" class="cm-item" @click="act('ungroup')">Ungroup <span class="cm-hint">⌘⇧G</span></button>
        <div v-if="canGroup || canUngroup" class="cm-divider" />
        <button class="cm-item cm-danger" @click="act('delete')">Delete <span class="cm-hint">Del</span></button>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import uxState from '../../stores/uxState.js'
import dataState from '../../stores/dataState.js'

defineProps({ x: Number, y: Number })
const emit = defineEmits(['action', 'close'])

const hasSelection = computed(() => uxState.selectedIds.length > 0)

const canGroup = computed(() =>
  uxState.selectedIds.length > 1 &&
  !uxState.selectedIds.some(id => dataState.elements[id]?.groupId)
)
const canUngroup = computed(() =>
  uxState.selectedIds.some(id => dataState.elements[id]?.groupId)
)

function act(action) {
  emit('action', action)
  emit('close')
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  gap: 16px;
}

.cm-item:hover {
  background: var(--surface-2);
}

.cm-danger { color: #e94560; }
.cm-danger:hover { background: rgba(233,69,96,0.12); }

.cm-hint {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.cm-divider {
  height: 1px;
  background: var(--border);
  margin: 3px 0;
}
</style>
