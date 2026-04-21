import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Content script bundle: React panel + bridge (CSS inlined into `content.js` via `?inline`).
 * Run `vite build --config vite.page.config.ts` after this to append `page-world.js`.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content.tsx'),
      output: {
        entryFileNames: 'content.js',
        format: 'iife',
      },
    },
    target: 'es2022',
  },
  publicDir: 'public',
})
