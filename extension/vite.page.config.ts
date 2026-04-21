import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Page-context instrumentation only (no React, no `chrome.*`). Appended to `dist/` after main build. */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/page-world.ts'),
      output: {
        entryFileNames: 'page-world.js',
        format: 'iife',
      },
    },
    target: 'es2022',
  },
})
