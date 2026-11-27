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
      // Frappe's own static files are /assets/<app>/…; a bare /assets/new or /assets/<ID> is this app's Asset screen, so it stays here.
      '^/(app|api|files|private|method|login|assets/[a-z_]+/)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false, // keep the Host (site1.local): Frappe picks the site from it
      },
      // Live updates (kitchen screens): the realtime server only accepts its own origin, so dev goes through this proxy.
      '/socket.io': { target: 'http://127.0.0.1:9000', ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: '../karya_erp/public/frontend',
    emptyOutDir: true,
    target: 'es2015',
  },
}))
