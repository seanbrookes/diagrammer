<template>
  <foreignObject
    v-if="visible"
    :x="el.x - 4"
    :y="el.y - el.fontSize * 1.15"
    :width="Math.max(220, maxLineWidth + 32)"
    :height="editorHeight"
    overflow="visible"
  >
    <textarea
      ref="inputRef"
      xmlns="http://www.w3.org/1999/xhtml"
      class="text-edit-input"
      :value="el.content"
      :style="{
        fontSize: el.fontSize + 'px',
        fontFamily: el.fontFamily,
        fontWeight: el.fontWeight,
        height: editorHeight + 'px',
      }"
      @input="onInput"
      @keydown.esc.stop="commit"
      @blur="commit"
    />
  </foreignObject>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import dataState, { updateElement } from '../../stores/dataState.js'
import { syncProxyToElement } from '../../stores/animationStore.js'
import uxState from '../../stores/uxState.js'
import { LINE_HEIGHT } from '../../theme.js'

const inputRef = ref(null)

const elementId = computed(() => uxState.editingTextId)
const visible = computed(() => !!elementId.value && !!dataState.elements[elementId.value])
const el = computed(() => (elementId.value ? dataState.elements[elementId.value] : null) ?? {
  x: 0, y: 0, content: '', fontSize: 16, fontFamily: 'sans-serif', fontWeight: 'normal', fill: '#333333',
})

const lines = computed(() => (el.value?.content ?? '').split('\n'))
const maxLineWidth = computed(() => Math.max(...lines.value.map(l => l.length)) * (el.value?.fontSize ?? 16) * 0.6)
const editorHeight = computed(() => Math.max(
  el.value.fontSize * 2.4,
  lines.value.length * el.value.fontSize * LINE_HEIGHT + 20
))

function onInput(e) {
  if (!elementId.value) return
  updateElement(elementId.value, { content: e.target.value })
  syncProxyToElement(elementId.value)
}

function commit() {
  uxState.editingTextId = null
}

watch(visible, (v) => {
  if (v) nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
})
</script>

<style>
.text-edit-input {
  background: rgba(30, 40, 58, 0.80);
  border: 1px solid #4a90e2;
  border-radius: 3px;
  padding: 3px 6px;
  outline: none;
  resize: none;
  width: 100%;
  min-width: 80px;
  line-height: 1.4;
  box-sizing: border-box;
  overflow: hidden;
  color: #e6edf3;
  caret-color: #4a90e2;
}

.text-edit-input::selection {
  background: rgba(74, 144, 226, 0.45);
  color: #ffffff;
}
</style>
