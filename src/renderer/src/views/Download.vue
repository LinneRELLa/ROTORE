<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-17 14:28:24
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-17 17:32:06
 * @FilePath: \ElectronTorrent\src\renderer\src\views\Download.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div>
    <h1>Download</h1>
    <p>Download page</p>
    <el-input v-model="magUrl"></el-input>
    <button @click="download">Download</button>
    <div v-for="x in allTorrents" :key="x.infoHash">
      <div class="TorrentName">{{ x.name }}</div>
      {{ x.files.length }} {{ x.size || 0 }} {{ x.downloaded || 0 }}
    </div>
  </div>
</template>
<script lang="ts" setup>
import type { ITorrentRender } from '@Type/index'
import { ref } from 'vue'

let magUrl = ref<string>('')
let clientTorrents = ref<ITorrentRender[]>([])
let allTorrents = ref<ITorrentRender[]>([])

window.electron.ipcRenderer.on('update-clients', (_event, data: ITorrentRender[]) => {
  console.log(data)
  clientTorrents.value = data
  for (let x of data) {
    let ToPatchTorrent = allTorrents.value.find((torrent) => torrent.magnetURI === x.magnetURI)
    if (ToPatchTorrent) {
      const { files, ...otherProps } = x
      ToPatchTorrent = { ...ToPatchTorrent, ...otherProps }
      for (let file of files) {
        let ToPatchFile = ToPatchTorrent.files.find((f) => f.path === file.path)
        if (ToPatchFile) {
          file = { ...file, ...ToPatchFile }
        } else {
          ToPatchTorrent.files.push(file)
        }
      }
    }
  }
})

/**
 * 比较两个 magnet 链接是否相同，忽略所有 tracker 参数（"tr"）。
 * @param link1 第一个 magnet 链接
 * @param link2 第二个 magnet 链接
 * @returns 如果主要参数（除 tracker 外）相同，则返回 true，否则返回 false
 */
function compareMagnetLinks(link1: string, link2: string): boolean {
  function normalize(magnet: string): string {
    // 移除 "magnet:?" 前缀
    if (magnet.startsWith('magnet:?')) {
      magnet = magnet.slice(8)
    }
    const params = new URLSearchParams(magnet)
    const entries: [string, string][] = []
    // 使用 forEach 遍历参数，因为某些 TS 配置下 entries() 不可用
    params.forEach((value, key) => {
      if (key.toLowerCase() === 'tr') return // 忽略 tracker 参数
      entries.push([key.toLowerCase(), value.toLowerCase()])
    })
    // 对参数按键和值排序，确保顺序一致
    entries.sort((a, b) => {
      const keyCompare = a[0].localeCompare(b[0])
      return keyCompare !== 0 ? keyCompare : a[1].localeCompare(b[1])
    })
    // 生成归一化字符串
    return entries.map(([k, v]) => `${k}=${v}`).join('&')
  }

  return normalize(link1) === normalize(link2)
}

function download(): void {
  if (allTorrents.value.find((x) => compareMagnetLinks(x.infoHash, magUrl.value))) return
  allTorrents.value.push({
    infoHash: magUrl.value,
    name: magUrl.value,
    magnetURI: magUrl.value,
    files: []
  })
  window.electron.ipcRenderer.send('addTorrent', magUrl.value)
}
</script>
<style lang="less" scoped>
.TorrentName {
  font-size: 20px;
  max-width: 120px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
