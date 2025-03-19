<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-17 14:28:24
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-19 15:29:20
 * @FilePath: \ElectronTorrent\src\renderer\src\views\Download.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div>
    <h1>Download</h1>
    <p>Download page</p>
    <el-input v-model.trim="magUrl"></el-input>
    <button @click="download">Download</button>
    <div v-for="x in allTorrents" :key="x.infoHash" @click="selectFile(x)">
      <div class="TorrentName">{{ x.name }}</div>
      {{ x.files.length }} {{ x.progress?.toFixed(4) || 0 }} {{ x.downloaded || 0 }}
      {{ x.fileSelected ? '已选' : '待选' }}
    </div>
    <div class="mask" v-if="selectPop">
      <div class="fileselect">
        <div
          v-for="file in currentTorrent?.files"
          :key="file.path"
          @click="file.initselected = !file.initselected"
        >
          <div>{{ file.initselected ? '选中' : '未选' }}</div>
          <div>{{ file.path }}</div>
          <div @click="selectPop = false">{{ file.size }}</div>
        </div>
        <div
          @click="
            sendFileSelect(
              currentTorrent?.initURL || '',
              currentTorrent?.files.filter((x) => x.initselected).map((x) => x.path) || []
            )
          "
        >
          确认下载
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import type { ITorrentRender } from '@Type/index'
import { ref } from 'vue'
import { useClientStore } from '@renderer/store/torrent'

let magUrl = ref<string>('')
let clientTorrents = ref<ITorrentRender[]>([])
let allTorrents = ref<ITorrentRender[]>([])
let currentTorrent = ref<ITorrentRender | null>(null)
let selectPop = ref<boolean>(false)

function selectFile(torrent: ITorrentRender): void {
  if (torrent.fileSelected) return
  currentTorrent.value = torrent
  selectPop.value = true
}

function sendFileSelect(torrentLink: string, files: string[]): void {
  // @ts-ignore (define in dts)
  window.electron.ipcRenderer.send('fileSelect', torrentLink, files)
  if (currentTorrent.value) {
    currentTorrent.value.fileSelected = true
  }

  selectPop.value = false
  currentTorrent.value = null
}

;(async function (): Promise<void> {
  allTorrents.value = useClientStore().client.torrents
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
  console.log(allTorrents.value, '<br><br>', data)
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
          ToPatchTorrent.files.push({ ...file, initselected: false })
        }
      }
    }
  }
})

// function openFolder(torrent): void {
//   // @ts-ignore (define in dts)
//   window.nodeAPI.shell.openPath(torrent.path)
// }

/**
 * 获取magnet中的参数
 * @param magnet  magnet 链接
 * @param key 需要提取的参数
 * @returns 如果不存在参数则返回空
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
// function compareMagnetLinks(link1: string, link2: string): boolean {
//   return normalize(link1, 'xt') === normalize(link2, 'xt')
// }

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
    fileSelected: false,
    files: []
  })
  // @ts-ignore (define in dts)
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

.mask {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(36, 40, 47);
  .fileselect {
    width: 400px;
    height: 400px;
  }
}
</style>
