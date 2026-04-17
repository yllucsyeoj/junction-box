import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/nodes': 'http://localhost:3001',
      '/run': 'http://localhost:3001',
      '/parse-nuon': 'http://localhost:3001',
    }
  }
})
