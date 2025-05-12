/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-05-12 13:56:07
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
    css: {
      preprocessorOptions: {
        less: {
          // modifyVars: { // 也可以通过 modifyVars 逐个定义，但不适合整个文件
          //   'primary-color': '#0a84ff',
          // },
          additionalData: `@import "@renderer/assets/theme.less";`, // 关键！
          javascriptEnabled: true
        }
      }
    },
    optimizeDeps: {
      exclude: [
        // 将 @ffmpeg/ffmpeg 及其相关工具包添加到排除列表
        '@ffmpeg/ffmpeg',
        '@ffmpeg/util'
        // '@ffmpeg/core'
      ]
    }
  }
})
