/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-04-16 16:50:05
 * @FilePath: \srce:\new\torrent\torrent\electron.vite.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@mainResource': resolve('resources'),
        '@Type': resolve('types'),
        '@renderer': resolve('src/renderer/src'),
        '@preload': resolve('src/preload')
      }
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'webview'
          }
        }
      })
    ],

  optimizeDeps: {
    exclude: [
      // 将 @ffmpeg/ffmpeg 及其相关工具包添加到排除列表
      '@ffmpeg/ffmpeg',
      '@ffmpeg/util',
      // 如果问题仍然存在，可以考虑也添加 @ffmpeg/core，但通常前两者足够
      // '@ffmpeg/core'
    ]
  },
  }
})
