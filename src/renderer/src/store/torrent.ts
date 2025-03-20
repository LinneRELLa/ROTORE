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
  }
})
