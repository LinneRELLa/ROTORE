import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer', // 指定 index.html 的目录
  plugins: [vue()],
  base: './', // 相对路径，确保 build 后资源引用正确
  build: {
    outDir: '../../dist/renderer', // 构建输出到 dist/renderer 目录
    emptyOutDir: true
  },
  server: {
    port: 5173,
    open: true
  },
  resolve: {
    alias: {
      '@mainResource': resolve('resources'),
      '@Type': resolve('types'),
      '@renderer': resolve('src/renderer/src'),
      '@preload': resolve('src/preload')
    }
  },
})
