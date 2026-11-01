<template>
  <Teleport to="body">
    <Transition name="about-fade">
      <div v-if="uxState.showAbout" class="about-backdrop" @click.self="close" @keydown.escape="close">
        <div class="about-dialog" role="dialog" aria-modal="true" aria-label="About">
          <button class="about-close" @click="close" title="Close">×</button>
          <div class="about-content">
            <h1>Diagrammer</h1>

            <p class="about-tagline">A lightweight, browser-based tool for creating animated SVG diagrams and storyboards.</p>

            <h2>What it does</h2>
            <p>
              Diagrammer lets you draw shapes, paths, and text on an infinite canvas, animate them along
              a timeline, and organise multiple frames into a storyboard. Everything runs locally in your
              browser — no server, no account required.
            </p>

            <h2>Key features</h2>
            <ul>
              <li>Vector drawing tools: rectangles, ellipses, lines, arrows, text, and bezier pen paths</li>
              <li>Frame-by-frame animation with keyframe interpolation</li>
              <li>Storyboard view for multi-scene compositions</li>
              <li>SVG export</li>
              <li>Snap-to-point and force-tangency for precise pen work</li>
              <li>Groups, layering, and non-destructive editing</li>
            </ul>

            <h2>How to use</h2>
            <p>
              Select a tool from the toolbar (or use keyboard shortcuts shown in the properties panel).
              Draw on the canvas, then use the timeline at the bottom to add keyframes and animate
              properties. Switch to Storyboard view (<kbd>M</kbd>) to manage multiple scenes.
            </p>

            <h2>About this project</h2>
            <p>
              <!-- Add your own background, attribution, or contact info here -->
              Built with Vue 3 and SVG. Contributions and feedback welcome.
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import uxState from '../../stores/uxState.js'

function close() { uxState.showAbout = false }

function onKey(e) {
  if (e.key === 'Escape' && uxState.showAbout) close()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.about-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.about-dialog {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  max-width: 560px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  scrollbar-width: thin;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.about-close {
  position: sticky;
  top: 16px;
  float: right;
  margin: 16px 16px 0 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}
.about-close:hover { color: var(--text); border-color: var(--text-muted); }

.about-content {
  padding: 32px 36px 36px;
}

.about-content h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 6px;
}

.about-tagline {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 28px;
  line-height: 1.5;
}

.about-content h2 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
  margin: 24px 0 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.about-content p,
.about-content li {
  font-size: 13px;
  color: var(--text);
  line-height: 1.65;
  margin: 0 0 8px;
}

.about-content ul {
  padding-left: 20px;
  margin: 0 0 8px;
}

.about-content li { margin-bottom: 4px; }

.about-content kbd {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 11px;
  font-family: monospace;
  color: var(--text);
}

.about-fade-enter-active,
.about-fade-leave-active {
  transition: opacity 0.18s ease;
}
.about-fade-enter-from,
.about-fade-leave-to {
  opacity: 0;
}
</style>
