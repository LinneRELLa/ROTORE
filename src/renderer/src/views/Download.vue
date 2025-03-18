<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-17 14:28:24
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-18 14:27:39
 * @FilePath: \ElectronTorrent\src\renderer\src\views\Download.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div>
    <h1>Download</h1>
    <p>Download page</p>
    <el-input v-model.trim="magUrl"></el-input>
    <button @click="download">Download</button>
    <div v-for="x in allTorrents" :key="x.infoHash" @click="openFolder(x)">
      <div class="TorrentName">{{ x.name }}</div>
      {{ x.files.length }} {{ x.size || 0 }} {{ x.downloaded || 0 }}
    </div>
  </div>
</template>
<script lang="ts" setup>
import type { ITorrentRender } from '@Type/index'
import { ref, onBeforeUnmount } from 'vue'

let magUrl = ref<string>('')
let clientTorrents = ref<ITorrentRender[]>([])
let allTorrents = ref<ITorrentRender[]>([])

;(async function (): Promise<void> {
  let DownloadStore = await window.electron.ipcRenderer.invoke('getDownloadStore')
  allTorrents.value = JSON.parse(DownloadStore)
})()

function assignIfDifferent(target: object, source: object): boolean {
  let changed = false
  for (const key in source) {
    if (target[key] !== source[key]) {
      target[key] = source[key]
      changed = true
    }
  }
  return changed
}

// @ts-ignore (define in dts)
window.electron.ipcRenderer.on('update-clients', (_event, data: ITorrentRender[]) => {
  clientTorrents.value = data
  console.log(allTorrents.value, '/n/n/r/n', data)
  for (let x of data) {
    let ToPatchTorrent = allTorrents.value.find((torrent) => {
      return sameTorrent(torrent, x)
    })

    if (ToPatchTorrent) {
      const { files, ...otherProps } = x
      console.log(assignIfDifferent(ToPatchTorrent, otherProps), 'patch')

      for (let file of files) {
        let ToPatchFile = ToPatchTorrent.files.find((f) => f.path === file.path)
        if (ToPatchFile) {
          console.log('patchfile')
          assignIfDifferent(ToPatchFile, file)
        } else {
          console.log('newfile')
          ToPatchTorrent.files.push(file)
        }
      }
    }
  }
})

function openFolder(torrent): void {
  // @ts-ignore (define in dts)
  window.nodeAPI.shell.openPath(torrent.path)
}

/**
 * 比较两个 magnet 链接是否相同，只关注xt。
 * @param link1 第一个 magnet 链接
 * @param link2 第二个 magnet 链接
 * @returns 如果主要参数（除 tracker 外）相同，则返回 true，否则返回 false
 */
function normalize(magnet: string, key: string): string | null {
  // 移除 "magnet:?" 前缀
  if (magnet.startsWith('magnet:?')) {
    magnet = magnet.slice(8)
  }
  try {
    const params = new URLSearchParams(magnet)
    return params.get(key)
  } catch {
    return ''
  }
}
function compareMagnetLinks(link1: string, link2: string): boolean {
  return normalize(link1, 'xt') === normalize(link2, 'xt')
}

function sameTorrent(torrent1, torrent2): boolean {
  return torrent1.initURL === torrent2.initURL || torrent1.infoHash === torrent2.infoHash
}

function download(): void {
  console.log('download')
  if (allTorrents.value.find((x) => x.initURL == magUrl.value)) return
  allTorrents.value.push({
    infoHash: magUrl.value,
    name: normalize(magUrl.value, 'dn') || magUrl.value,
    magnetURI: magUrl.value,
    initURL: magUrl.value,
    files: []
  })
  window.electron.ipcRenderer.send('addTorrent', magUrl.value)
}

// 修改 "request-downloadstore" 处理，将数据转换为 JSON 对象后再发送
window.electron.ipcRenderer.on('request-downloadstore', () => {
  const plainData = JSON.parse(JSON.stringify(allTorrents.value))
  window.electron.ipcRenderer.send('exportDownloadStoreResponse', plainData)
})
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
