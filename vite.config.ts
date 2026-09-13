import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * upng-js falls back to window.pako when its CommonJS require helper is not
 * available. Export and decode workers have no window, so provide pako as a
 * normal module dependency before Vite wraps the package.
 */
const workerSafeUpng = (): Plugin => ({
  name: 'moonsprite:worker-safe-upng',
  enforce: 'pre',
  transform(code, id) {
    if (!id.split('?', 1)[0].replace(/\\/g, '/').endsWith('/upng-js/UPNG.js')) return null
    const patchedBody = code
      .replace('var pako;', '')
      .replace('if (typeof module == "object") {module.exports = UPNG;}  else {window.UPNG = UPNG;}', 'if (typeof module == "object") {module.exports = UPNG;} else {globalThis.UPNG = UPNG;}')
      .replace('if (typeof require == "function") {pako = require("pako");}  else {pako = window.pako;}', '')
    return patchedBody === code ? null : { code: `import pako from 'pako';\n${patchedBody}`, map: null }
  }
})

export default defineConfig(({ mode }) => {
  const performanceBuild = mode === 'performance-production' || mode === 'performance-profile'
  const reactProfile = mode === 'performance-profile'
  return {
    root: resolve(__dirname, 'src/renderer'),
    define: {
      __MOONSPRITE_PERFORMANCE_BUILD__: JSON.stringify(performanceBuild),
      __MOONSPRITE_REACT_PROFILE__: JSON.stringify(reactProfile)
    },
    resolve: {
      alias: [
        ...(reactProfile ? [{ find: /^react-dom\/client$/, replacement: resolve(__dirname, 'node_modules/react-dom/profiling.js') }] : []),
        { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
        { find: '@', replacement: resolve(__dirname, 'src/renderer/src') }
      ]
    },
    plugins: [workerSafeUpng(), react()],
    build: {
      outDir: resolve(__dirname, performanceBuild ? `out/${mode}` : 'out/renderer'),
      emptyOutDir: true
    },
    worker: { plugins: () => [workerSafeUpng()] },
    server: { port: 5173, strictPort: true }
  }
})
