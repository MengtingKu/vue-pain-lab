import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages 部署在 /vue-pain-lab/ 底下；只在 build 套用，dev server 維持根路徑，
  // 因為 scripts/cdp-trace 的 runner 都是用 http://localhost:{port}/scenarios/... 開頁
  base: command === 'build' ? '/vue-pain-lab/' : '/',
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
