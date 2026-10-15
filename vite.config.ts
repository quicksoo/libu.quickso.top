import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

function inlineRelease(): Plugin {
  return {
    name: 'inline-release',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const htmlPath = new URL('./dist/index.html', import.meta.url)
      let html = await readFile(htmlPath, 'utf8')
      html = await inlineAssets(html, htmlPath)
      await writeFile(htmlPath, html)
      await rm(new URL('./dist/assets', import.meta.url), { recursive: true, force: true })
      await copyPublicAssets()
    },
  }
}

async function copyPublicAssets() {
  await mkdir(new URL('./dist/img/', import.meta.url), { recursive: true })
  await Promise.all([
    copyFile(new URL('./public/favicon.svg', import.meta.url), new URL('./dist/favicon.svg', import.meta.url)),
    copyFile(new URL('./img/gift-book-main-screen.png', import.meta.url), new URL('./dist/img/gift-book-main-screen.png', import.meta.url)),
    copyFile(new URL('./img/gift-book-display-screen.png', import.meta.url), new URL('./dist/img/gift-book-display-screen.png', import.meta.url)),
  ])
}

async function inlineAssets(html: string, htmlPath: URL) {
  const assetUrl = (asset: string) => new URL(asset.replace(/^\.\//, './'), htmlPath)
  const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]
  for (const match of styles) {
    const source = await readFile(assetUrl(match[1]), 'utf8')
    html = html.replace(match[0], () => `<style>${source}</style>`)
  }
  const scripts = [...html.matchAll(/<script([^>]*) src="([^"]+)"><\/script>/g)]
  for (const match of scripts) {
    const source = (await readFile(assetUrl(match[2]), 'utf8')).replace(/<\/script/gi, '<\\/script')
    html = html.replace(match[0], () => `<script${match[1]}>${source}</script>`)
  }
  return html
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  publicDir: false,
  build: { rolldownOptions: { output: { codeSplitting: false } } },
  plugins: [vue(), inlineRelease()],
})
