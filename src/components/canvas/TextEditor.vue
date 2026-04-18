<template>
  <foreignObject
    v-if="visible"
    :x="el.x"
    :y="el.y - el.fontSize * 1.2"
    :width="Math.max(200, textWidth + 20)"
    :height="el.fontSize * 2.5"
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
        color: el.fill,
      }"
      @input="onInput"
      @keydown.esc.stop="commit"
      @keydown.enter.exact.stop.prevent="commit"
      @blur="commit"
    />
  </foreignObject>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import dataState, { updateElement } from '../../stores/dataState.js'
import { syncProxyToElement } from '../../stores/animationStore.js'
import uxState from '../../stores/uxState.js'

const inputRef = ref(null)

const elementId = computed(() => uxState.editingTextId)
const visible = computed(() => !!elementId.value && !!dataState.elements[elementId.value])
const el = computed(() => (elementId.value ? dataState.elements[elementId.value] : null) ?? {
  x: 0, y: 0, content: '', fontSize: 18, fontFamily: 'sans-serif', fontWeight: 'normal', fill: '#eaeaea',
})

const textWidth = computed(() => (el.value?.content?.length ?? 0) * (el.value?.fontSize ?? 18) * 0.6)

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
  background: rgba(26, 26, 46, 0.85);
  border: 1px solid #4a90e2;
  border-radius: 3px;
  padding: 2px 4px;
  outline: none;
  resize: none;
  width: 100%;
  min-width: 80px;
  line-height: 1.4;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
