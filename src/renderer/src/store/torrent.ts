/*
 * @Author: Linne Rella 3223961933@qq.com
 * @Date: 2025-03-20 18:08:34
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-04-18 19:18:18
 * @FilePath: \electronTorrent\src\renderer\src\store\torrent.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { defineStore } from 'pinia'
import type { ITorrentRender } from '@Type/index'
import { ITorrent } from '@Type/index'

// useStore 可以是 useUser、useCart 之类的任何东西
// 第一个参数是应用程序中 store 的唯一 id
export const useClientStore = defineStore('client', {
  state: (): {
    AlltorrentsStore: ITorrentRender[]
    currentTorrent: ITorrentRender
    clientTorrentsStore: ITorrentRender[]
    inited: boolean
  } => {
    return {
      AlltorrentsStore: [],
      clientTorrentsStore: [],
      currentTorrent: new ITorrent(),
      inited: false
    }
  },
  actions: {
    updateSelectedSize(torrent: ITorrentRender) {
      if (!torrent || !Array.isArray(torrent.files)) {
        if (torrent) {
          torrent.selectedSize = 0
          torrent.selectedTotal = 0
        }
        return
      }
      torrent.selectedTotal = torrent.files.reduce((acc, cur) => {
        return acc + (cur.size || 0) // 确保 size 存在
      }, 0)
      torrent.selectedSize = torrent.files.reduce((acc, cur) => {
        // 这里应该只加 'initselected' 为 true 的文件下载量
        if (cur.initselected) {
          return acc + (cur.downloaded || 0) // 确保 downloaded 存在
        }
        return acc
      }, 0)

      // 纠正：selectedTotal 应该只计算 initselected 为 true 的文件总大小
      torrent.selectedTotal = torrent.files.reduce((acc, cur) => {
        if (cur.initselected) {
          return acc + (cur.size || 0)
        }
        return acc
      }, 0)

      // console.log(`计算 ${torrent.name}: 已选大小 ${torrent.selectedSize} / ${torrent.selectedTotal}`);
    }
  }
})
