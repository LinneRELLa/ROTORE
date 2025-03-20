<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-17 14:28:24
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-20 16:22:44
 * @FilePath: \ElectronTorrent\src\renderer\src\views\Download.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
///
<reference path="@preload/index.d.ts" />
<template>
  <div class="download-container">
    <!-- 头部区域 -->
    <header class="page-header">
      <h1 class="page-title">文件下载</h1>
      <p class="page-subtitle">支持磁力链接、HTTP/HTTPS链接和本地文件路径</p>
    </header>

    <!-- 下载输入区域 -->
    <div class="input-section">
      <el-input
        v-model.trim="magUrl"
        placeholder="请输入下载链接或路径"
        class="download-input"
        size="large"
      >
        <template #append>
          <el-tooltip :disabled="isVliadUrl" content="请输入有效链接" placement="top">
            <el-button
              type="primary"
              :disabled="!isVliadUrl"
              @click="download"
              class="download-btn"
              size="large"
            >
              开始下载
            </el-button>
          </el-tooltip>
        </template>
      </el-input>
    </div>

    <!-- 下载任务列表 -->
    <div class="task-list">
      <el-card
        v-for="x in ClientStore.AlltorrentsStore"
        :key="x.infoHash"
        class="task-card"
        shadow="hover"
      >
        <div class="task-content">
          <!-- 任务信息 -->
          <div class="task-info">
            <div class="task-header">
              <h3 class="task-title" :title="x.name">{{ x.name }}</h3>
              <el-tag :type="x.fileSelected ? 'success' : 'warning'" size="small">
                {{ x.fileSelected ? '已选文件' : '待选文件' }}
              </el-tag>
            </div>

            <div class="task-stats">
              <div class="stat-item">
                <el-icon><Document /></el-icon>
                {{ x.files.length }} 个文件
              </div>
              <div class="stat-item">
                <el-icon><DataLine /></el-icon>
                {{ ((x.progress?.toFixed(4) || 0) as number) * 100 }}%
              </div>
              <div class="stat-item">
                <el-icon><Download /></el-icon>
                {{ formatSize(x.downloaded || 0) }}
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="task-actions">
            <el-button
              v-if="!x.fileSelected"
              @click="selectFile(x)"
              type="primary"
              size="small"
              plain
            >
              选择文件
            </el-button>

            <el-popover
              placement="top"
              :width="200"
              trigger="click"
              v-model:visible="popoverVisible[x.infoHash]"
            >
              <template #reference>
                <el-button type="danger" size="small" plain> 删除任务 </el-button>
              </template>
              <p class="delete-confirm">确认删除该任务？</p>
              <div class="delete-actions">
                <el-button size="small" @click="popoverVisible[x.infoHash] = false">取消</el-button>
                <el-button size="small" type="danger" @click="confirmDelete(x)">确认删除</el-button>
              </div>
            </el-popover>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 文件选择弹窗 -->
    <el-dialog v-model="selectPop" title="选择文件" width="600px" top="5vh">
      <div v-if="ClientStore.currentTorrent?.files.length" class="file-selector">
        <div class="file-list">
          <div
            v-for="file in ClientStore.currentTorrent?.files"
            :key="file.path"
            class="file-item"
            :class="{ selected: file.initselected }"
            @click="file.initselected = !file.initselected"
          >
            <el-checkbox v-model="file.initselected" class="file-checkbox" @click.stop />
            <div class="file-info">
              <div class="file-name">{{ file.path }}</div>
              <div class="file-size">{{ formatSize(file.size) }}</div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <el-button @click="selectPop = false">取消</el-button>
          <el-button
            type="primary"
            @click="
              sendFileSelect(
                ClientStore.currentTorrent?.initURL || '',
                ClientStore.currentTorrent?.files.filter((x) => x.initselected).map((x) => x.path)
              )
            "
          >
            确认下载 ({{
              ClientStore.currentTorrent?.files.filter((x) => x.initselected).length
            }}个文件)
          </el-button>
        </div>
      </div>
      <div v-else class="loading-files">
        <el-icon class="loading-icon"><Loading /></el-icon>
        正在加载文件列表...
      </div>
    </el-dialog>
  </div>
</template>
<script lang="ts" setup>
import type { ITorrentRender } from '@Type/index'
import { ITorrent } from '@Type/index'
import { ref, computed } from 'vue'
import { useTorrent } from '@renderer/hooks/useTorrent'

const { ClientStore } = useTorrent()

let magUrl = ref<string>('')
let selectPop = ref<boolean>(false)

// 新增：保存各任务弹窗显示状态和删除文件选项
const popoverVisible = ref<{ [key: string]: boolean }>({})
// const deleteFileOptions = ref<{ [key: string]: boolean }>({})

function confirmDelete(torrent: ITorrentRender): void {
  Remove(torrent, false)
  popoverVisible.value[torrent.infoHash] = false
}

function Remove(torrent: ITorrentRender, removeFile: boolean): void {
  ClientStore.AlltorrentsStore = ClientStore.AlltorrentsStore.filter(
    (x) => x.infoHash !== torrent.infoHash
  )
  window.electron.ipcRenderer.send('removeTorrent', torrent.infoHash, removeFile)
}

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

function formatSize(size: number): string {
  if (size < 1024) {
    return size + ' B'
  } else if (size < 1024 * 1024) {
    return (size / 1024).toFixed(2) + ' KB'
  } else if (size < 1024 * 1024 * 1024) {
    return (size / 1024 / 1024).toFixed(2) + ' MB'
  } else {
    return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  }
}

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
.download-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 2.5rem;

  .page-title {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: white;
  }

  .page-subtitle {
    color: #909399;
    font-size: 0.9rem;
  }
}

.input-section {
  margin-bottom: 2rem;

  .download-input {
    :deep(.el-input-group__append) {
      background-color: var(--el-color-primary);
      border: none;

      .download-btn {
        color: white;
        padding: 0 1.5rem;
      }
    }
  }
}

.task-list {
  display: grid;
  gap: 1rem;
}

.task-card {
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-2px);
  }

  .task-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 0.8rem;
  }

  .task-title {
    font-size: 1.1rem;
    margin: 0;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-stats {
    display: flex;
    gap: 1.5rem;
    color: #606266;

    .stat-item {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.9rem;
    }
  }

  .task-actions {
    flex-shrink: 0;
    display: flex;
    gap: 0.8rem;
  }
}

.file-selector {
  .file-list {
    max-height: 50vh;
    overflow-y: auto;
    margin-bottom: 1.5rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    padding: 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: #f5f7fa;
    }

    &.selected {
      background-color: #ecf5ff;
    }
  }

  .file-checkbox {
    margin-right: 1rem;
  }

  .file-info {
    flex-grow: 1;

    .file-name {
      color: #303133;
      margin-bottom: 0.2rem;
    }

    .file-size {
      color: #909399;
      font-size: 0.8rem;
    }
  }
}

.loading-files {
  text-align: center;
  padding: 2rem;

  .loading-icon {
    animation: rotating 2s linear infinite;
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: #909399;
  }
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.delete-confirm {
  margin: 1rem 0;
  text-align: center;
}

.delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
}
</style>
