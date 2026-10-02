import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 自架 JetBrains Mono（lab-theme 的等寬字），@font-face 只在有元素用到時才下載
import '@fontsource-variable/jetbrains-mono/wght.css'
import './assets/lab-theme.css'
import App from './App.vue'
import router from './app/router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
