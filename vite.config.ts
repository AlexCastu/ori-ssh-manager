import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
  build: {
    // El webview de Tauri es conocido: WebView2 (Chromium moderno) en Windows,
    // WKWebView en macOS. Apuntar al motor real evita transpilación y
    // polyfills innecesarios → bundle menor y arranque más rápido.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links', '@xterm/addon-webgl'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
