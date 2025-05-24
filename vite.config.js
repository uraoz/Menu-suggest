import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 3000,
    open: true
  },
  define: {
    // 環境変数をグローバルに定義
    __GOOGLE_MAPS_API_KEY__: JSON.stringify(process.env.VITE_GOOGLE_MAPS_API_KEY)
  }
})