import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vue from '@vitejs/plugin-vue'

const repoRootDbDir = fileURLToPath(new URL('../db', import.meta.url))

const dbProxyPlugin = () => {
  const handleRequest = (req, res, next) => {
    const reqUrl = req.url || ''
    const normalizedPath = reqUrl.split('?')[0]
    if (!normalizedPath.endsWith('.db')) {
      next()
      return
    }

    const relativePath = normalizedPath.replace(/^\/+(?:db\/+)?/, '')
    const targetPath = path.resolve(repoRootDbDir, relativePath)
    if (!targetPath.startsWith(path.resolve(repoRootDbDir))) {
      res.statusCode = 400
      res.end('Bad request')
      return
    }
    if (!fs.existsSync(targetPath)) {
      next()
      return
    }

    const stat = fs.statSync(targetPath)
    const fileSize = stat.size
    const range = req.headers.range

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=0')

    if (!range) {
      res.setHeader('Content-Length', fileSize)
      fs.createReadStream(targetPath).pipe(res)
      return
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(range)
    if (!match) {
      res.statusCode = 416
      res.end()
      return
    }

    const start = Number.parseInt(match[1], 10)
    const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileSize) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${fileSize}`)
      res.end()
      return
    }

    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
    res.setHeader('Content-Length', end - start + 1)
    fs.createReadStream(targetPath, { start, end }).pipe(res)
  }

  return {
    name: 'db-proxy-plugin',
    configureServer(server) {
      server.middlewares.use('/db', handleRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/db', handleRequest)
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    dbProxyPlugin()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),  //项目根目录
        repoRootDbDir
      ]
    }
  }
})
