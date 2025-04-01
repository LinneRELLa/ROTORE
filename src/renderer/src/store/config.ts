import { defineStore } from 'pinia'

// useStore 可以是 useUser、useCart 之类的任何东西
// 第一个参数是应用程序中 store 的唯一 id
export const useConfigStore = defineStore('config', {
  state: () => {
    return {
      PathConfig: {
        base: '',
        proxy: '',
        source: '',
        downloadPath: '',
        playerPath: '',
        useProxy: false,
        proxyPath: 'socks5://127.0.0.1:7890',
        homePath: ''
      }
    }
  }
})
