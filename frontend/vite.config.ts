import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '3000'),
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3002',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_SOCKET_URL || 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
