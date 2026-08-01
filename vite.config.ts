import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Hash public brand assets so browsers don't keep an old /logo.png. */
function publicAssetHash(relativePath: string): string {
  try {
    return createHash('sha1')
      .update(readFileSync(new URL(relativePath, import.meta.url)))
      .digest('hex')
      .slice(0, 10)
  } catch {
    return '0'
  }
}

const brandMarkV = publicAssetHash('./public/logo.png')
const faviconV = publicAssetHash('./public/favicon.svg')

export default defineConfig({
  define: {
    __BRAND_MARK_V__: JSON.stringify(brandMarkV),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'brand-favicon-version',
      transformIndexHtml(html) {
        return html.replace(
          'href="/favicon.svg"',
          `href="/favicon.svg?v=${faviconV}"`,
        )
      },
    },
  ],
  build: {
    target: 'es2022',
  },
})

