import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ibsen_play/', // GitHub Pages base for dette repoet
  build: {
    outDir: 'docs',
    emptyOutDir: true
  }
})
