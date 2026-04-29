import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

if (import.meta.env.DEV) {
  Promise.all([
    import('./stores/dataState.js'),
    import('./stores/uxState.js'),
  ]).then(([data, ux]) => {
    window.__diagrammer = { dataState: data.default, uxState: ux.default }
  })
}
