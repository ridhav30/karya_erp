import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Frappe serves built files from karya_erp/public at /assets/karya_erp/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/assets/karya_erp/frontend/' : '/',
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    // Bench sites are reached by name (site1.local, site2.local …) in dev
    allowedHosts: ['.local', '.localhost'],
    port: 5173,
    // Forward Frappe routes to the bench web server during `npm run dev`
    proxy: {
      '^/(app|api|assets|files|private|method|login)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false, // keep the Host (site1.local): Frappe picks the site from it
      },
    },
  },
  build: {
    outDir: '../karya_erp/public/frontend',
    emptyOutDir: true,
    target: 'es2015',
  },
}))
