import { fileURLToPath } from 'node:url'
import { createServer, defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function webTrial(): Plugin {
  return {
    name: 'moonsprite:website-web-trial',
    async configureServer(server) {
      const editor = await createServer({
        configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
        mode: 'web-trial',
        // The website owns the HTTP listener. No second port or process needed.
        server: { middlewareMode: true, hmr: false },
      })
      server.httpServer?.once('close', () => {
        void editor.close().catch((error) => server.config.logger.error(String(error)))
      })
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?', 1)[0]
        if (path === '/try' || path?.startsWith('/try/')) {
          editor.middlewares(request, response, next)
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), webTrial()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
