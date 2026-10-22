import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

document.documentElement.classList.toggle('is-embedded', new URLSearchParams(window.location.search).get('embed') === '1')

createApp(App).mount('#app')
