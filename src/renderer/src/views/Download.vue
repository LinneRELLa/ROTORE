<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-17 14:28:24
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-20 14:39:52
 * @FilePath: \ElectronTorrent\src\renderer\src\views\Download.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
///
<reference path="@preload/index.d.ts" />
<template>
  <div>
    <h1>Download</h1>
    <p>Download page</p>
    <el-input v-model.trim="magUrl" placeholder="磁力链接/http https 链接/本地文件路径"></el-input>
    <el-tooltip
      class="box-item"
      effect="dark"
      content="链接无效"
      placement="top-start"
      :disabled="isVliadUrl"
    >
      <el-button :disabled="!isVliadUrl" @click="download">下载</el-button>
    </el-tooltip>

    <div v-for="x in ClientStore.AlltorrentsStore" :key="x.infoHash" @click="selectFile(x)">
      <div class="TorrentName">{{ x.name }}</div>
      {{ x.files.length }} {{ x.progress?.toFixed(4) || 0 }} {{ x.downloaded || 0 }}
      {{ x.fileSelected ? '已选' : '待选' }}
    </div>
    <div v-if="selectPop" class="mask">
      <div v-if="ClientStore.currentTorrent?.files.length" class="fileselect">
        <div
          v-for="file in ClientStore.currentTorrent?.files"
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
              ClientStore.currentTorrent?.initURL || '',
              ClientStore.currentTorrent?.files.filter((x) => x.initselected).map((x) => x.path) ||
                []
            )
          "
        >
          确认下载
        </div>
      </div>
      <div v-else class="fileselect" @click="selectPop = false">正在获取文件...</div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import type { ITorrentRender } from '@Type/index'
import  { ITorrent } from '@Type/index'
import { ref, computed } from 'vue'
import { useTorrent } from '@renderer/hooks/useTorrent'

const { ClientStore } = useTorrent()

let magUrl = ref<string>('')

let selectPop = ref<boolean>(false)

function selectFile(torrent: ITorrentRender): void {
  if (torrent.fileSelected) return
  ClientStore.currentTorrent = torrent
  selectPop.value = true
}

function sendFileSelect(torrentLink: string, files: string[]): void {
  window.electron.ipcRenderer.send('fileSelect', torrentLink, files)
  if (ClientStore.currentTorrent) {
    ClientStore.currentTorrent.fileSelected = true
  }

  selectPop.value = false
  ClientStore.currentTorrent = new ITorrent()
}

// ;(async function (): Promise<void> {
//   ClientStore.AlltorrentsStore = useClientStore().client.torrents
// })()

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

//判断是否有效
function isValidTorrentIdentifier(input): boolean {
  // 1. 如果是字符串，则可能是：
  if (typeof input === 'string') {
    // a. Magnet URI：必须以 "magnet:" 开头，并含有 xt=urn:btih: 后跟 40 个十六进制或 32 个 base32 字符
    const magnetRegex = /^magnet:\?xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})(?:&.*)?$/
    if (magnetRegex.test(input)) {
      return true
    }
    // b. http/https 链接，指向 torrent 文件（通常以 .torrent 结尾，允许带参数）
    const httpUrlRegex = /^(https?:\/\/.*\.torrent(?:\?.*)?)$/i
    if (httpUrlRegex.test(input)) {
      return true
    }
    // c. 文件系统路径（简单判断以 .torrent 结尾，Node.js 下可用更严格的判断）
    const fsPathRegex = /.*\.torrent$/i
    if (fsPathRegex.test(input)) {
      return true
    }
    // d. 纯 info hash 的十六进制字符串（40 个十六进制字符）
    const hexHashRegex = /^[a-fA-F0-9]{40}$/
    if (hexHashRegex.test(input)) {
      return true
    }
  }

  // 2. 如果是 Uint8Array，则可能是：
  if (input instanceof Uint8Array) {
    // a. info hash 的二进制形式（20 字节）
    if (input.length === 20) {
      return true
    }
    // b. torrent 文件（二进制 bencode 格式，通常以 "d8:" 开头，即字符 "d", "8", ":"）
    if (
      input.length >= 3 &&
      input[0] === 100 && // 'd'
      input[1] === 56 && // '8'
      input[2] === 58
    ) {
      // ':'
      return true
    }
  }

  // 3. 如果是对象，则可能是 parse‑torrent 得到的已解析 torrent 对象
  if (typeof input === 'object' && input !== null) {
    // 简单判断：是否有 infoHash 属性和 info 对象（实际情况可根据 parse‑torrent 返回的结构做更细致判断）
    if (typeof input.infoHash === 'string' && input.info && typeof input.info === 'object') {
      return true
    }
  }

  return false
}

let isVliadUrl = computed(() => {
  console.log(isValidTorrentIdentifier(magUrl.value), 'isVliadUrl')
  return isValidTorrentIdentifier(magUrl.value)
})

function download(): void {
  console.log('download')
  if (ClientStore.AlltorrentsStore.find((x) => x.initURL == magUrl.value)) return
  ClientStore.AlltorrentsStore.push({
    infoHash: magUrl.value,
    name: normalize(magUrl.value, 'dn') || magUrl.value,
    magnetURI: magUrl.value,
    initURL: magUrl.value,
    fileSelected: false,
    files: [],
    selectedSize: 0,
    selectedTotal: 0,
    cleared: false,
    error: ''
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
