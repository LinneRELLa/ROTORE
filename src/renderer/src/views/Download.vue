<!--
 * @Author: Linne Rella 3223961933@qq.com
 * @Date: 2025-03-20 18:08:34
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-27 10:56:33
 * @FilePath: \electronTorrent\src\renderer\src\views\Download.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
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

    <!-- 主要内容区域 -->
    <div class="main-content" :class="{ 'has-selected': selectedTask }">
      <!-- 下载任务列表 -->
      <div class="task-list-wrapper">
        <div class="task-list">
          <el-card
            v-for="x in ClientStore.AlltorrentsStore"
            :key="x.infoHash"
            class="task-card"
            shadow="hover"
            :class="{ active: selectedTask?.infoHash === x.infoHash }"
            @click="selectTask(x)"
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
                    {{ (((x.selectedSize / x.selectedTotal || 0) as number) * 100)?.toFixed(2) }}
                    %
                  </div>
                  <div class="stat-item">
                    <el-icon><Download /></el-icon>
                    {{ formatSize(x.downloaded || 0) }}
                  </div>
                  <div class="stat-item" v-if="!x.cleared">
                    <el-icon><Sort /></el-icon>
                    {{ formatSize(x.downloadSpeed || 0) + '/s' }}
                  </div>
                  <div class="stat-item" style="cursor: pointer" @click.stop="openfolder(x)">
                    <el-icon><Folder /></el-icon>
                    {{ '打开目录' }}
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="task-actions" @click.stop>
                <el-button
                  v-if="
                    x.fileSelected &&
                    !x.cleared &&
                    !ClientStore.clientTorrentsStore.find((y) => y.initURL == x.initURL)
                  "
                  type="primary"
                  size="small"
                  plain
                  @click="resume(x)"
                >
                  继续下载
                </el-button>

                <el-button
                  v-if="!x.fileSelected"
                  type="primary"
                  size="small"
                  plain
                  @click="selectFile(x)"
                >
                  选择文件
                </el-button>

                <el-popover
                  placement="top"
                  :width="'auto'"
                  trigger="click"
                  v-model:visible="popoverVisible[x.infoHash]"
                >
                  <template #reference>
                    <el-button type="danger" size="small" plain @click.stop> 删除任务 </el-button>
                  </template>
                  <p class="delete-confirm">确认删除该任务？</p>
                  <el-checkbox v-model="FileDelte" label="同时删除文件" class="FileDelte" />
                  <div class="delete-actions">
                    <el-button size="small" @click="popoverVisible[x.infoHash] = false"
                      >取消</el-button
                    >
                    <el-button size="small" type="danger" @click="confirmDelete(x)"
                      >确认删除</el-button
                    >
                  </div>
                </el-popover>
              </div>
            </div>
          </el-card>
        </div>
      </div>
      <!-- 任务详情侧边栏 -->
      <transition name="slide-fade">
        <div v-if="selectedTask" class="task-detail">
          <div class="detail-header">
            <h3>{{ selectedTask.name }}</h3>
            <el-icon class="close-btn" @click="selectedTask = null"><Close /></el-icon>
          </div>

          <!-- 文件列表 -->
          <div class="files-section">
            <h4 class="section-title">文件列表</h4>
            <div class="files-container">
              <div v-for="file in selectedTask.files" :key="file.path" class="file-item">
                <div class="file-info">
                  <el-button v-if="file.initselected" size="small" style="margin-right: 0.4rem;">
                    <el-icon v-if="file.progress==1"><Select /></el-icon>
                    <el-icon v-else><Download /></el-icon>
                    <!-- 已选择 -->
                  </el-button>
                  <div class="file-name file-name-side" :title="file.path">{{ file.name }}</div>
                  <div class="file-actions">
                    <el-button
                      v-if="isVideoFile(file.name) && file.initselected"
                      size="small"
                      @click.stop="playVideo(file)"
                    >
                      <el-icon><VideoPlay /></el-icon>
                      播放
                    </el-button>
                    <div class="file-size">{{ formatSize(file.size) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="stats-section">
            <h4 class="section-title">统计信息</h4>
            <div class="stats">
              <div class="stat-item">
                <label>下载进度:</label>
                <span>
                  {{
                    (
                      ((selectedTask.selectedSize / selectedTask.selectedTotal || 0) as number) *
                      100
                    )?.toFixed(2)
                  }}%
                </span>
              </div>
              <div class="stat-item">
                <label>下载速度:</label>
                <span>{{
                  selectedTask.cleared ? '已完成' : formatSpeed(selectedTask.downloadSpeed || 0)
                }}</span>
              </div>
            </div>
          </div>

          <!-- 速度曲线图 -->
          <div class="chart-section">
            <h4 class="section-title">速度曲线</h4>
            <div class="chart-container">
              <div ref="speedChart" style="height: 200px"></div>
            </div>
          </div>
        </div>
      </transition>
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
              <div class="file-name">{{ file.name }}</div>
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

    <!-- 视频弹窗 -->
    <el-dialog v-model="videoVisible" class="video-dialog" :show-close="false" fullscreen>
      <VideoPlayer
        v-if="videoVisible"
        :video-url="currentVideoUrl"
        :file-name="currentFileName"
        @close="videoVisible = false"
      />
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import type { ITorrentRender } from '@Type/index'
import { ITorrent } from '@Type/index'
import { ref, watch, computed, onBeforeUnmount, nextTick } from 'vue'
import { useTorrent } from '@renderer/hooks/useTorrent'
import * as echarts from 'echarts'
import { ElNotification } from 'element-plus'
const { join } = window.nodeAPI.path
const { ClientStore } = useTorrent()
const FileDelte = ref<boolean>(false)
let magUrl = ref<string>('')
let selectPop = ref<boolean>(false)

// 新增：保存各任务弹窗显示状态和删除文件选项
const popoverVisible = ref<{ [key: string]: boolean }>({})
// const deleteFileOptions = ref<{ [key: string]: boolean }>({})

function confirmDelete(torrent: ITorrentRender): void {
  if (FileDelte.value) {
    torrent.files.forEach((file) => {
      const filepath = join(torrent.path as string, file.path)
      if (window.nodeAPI.fs.existsSync(filepath)) {
        try {
          window.nodeAPI.fs.unlinkSync(filepath)
          console.log(`Deleted file: ${filepath}`)
        } catch (err) {
          console.error(`Failed to delete ${filepath}:`, err)
        }
      }
    })
  }
  Remove(torrent, false)
  popoverVisible.value[torrent.infoHash] = false
}

function Remove(torrent: ITorrentRender, removeFile: boolean): void {
  ClientStore.AlltorrentsStore = ClientStore.AlltorrentsStore.filter(
    (x) => x.infoHash !== torrent.infoHash
  )
  window.electron.ipcRenderer.send('removeTorrent', torrent.initURL, removeFile)
  window.electron.ipcRenderer.send('writeTorrent')
}

function selectFile(torrent: ITorrentRender): void {
  if (torrent.fileSelected) return
  ClientStore.currentTorrent = torrent
  selectPop.value = true
}

function sendFileSelect(torrentLink: string, files: string[]): void {
  if (ClientStore.clientTorrentsStore.find((x) => x.initURL === torrentLink)) {
    window.electron.ipcRenderer.send('fileSelect', torrentLink, files)
  } else {
    window.electron.ipcRenderer.send('resumeTorrent', torrentLink, files)
  }

  if (ClientStore.currentTorrent) {
    ClientStore.currentTorrent.fileSelected = true
  }
  selectPop.value = false
  ClientStore.currentTorrent = new ITorrent()
  window.electron.ipcRenderer.send('writeTorrent')
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
  let ExistTorrent = ClientStore.AlltorrentsStore.find((x) => x.initURL == magUrl.value)
  if (ExistTorrent) {
    ElNotification({
      title: 'Warning',
      message: '已存在同链接的任务',
      type: 'warning'
    })
    return
  }

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
  window.electron.ipcRenderer.send('writeTorrent')
}

function resume(torrent: ITorrentRender): void {
  window.electron.ipcRenderer.send(
    'resumeTorrent',
    torrent.initURL,
    torrent.files.filter((x) => x.initselected).map((x) => x.path)
  )
}

function openfolder(torrent: ITorrentRender): void {
  if (window.nodeAPI.fs.existsSync(torrent.path)) {
    window.nodeAPI.shell.openPath(torrent.path)
  } else {
    ElNotification({
      title: 'Warning',
      message: '目标目录不存在',
      type: 'warning'
    })
  }
}

// 新增响应式数据
const selectedTask = ref<ITorrentRender | null>(null)
const speedChart = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

// 新增速度数据缓存
const speedData = ref<number[]>(Array(60).fill(0))

const selectTask = (task: ITorrentRender): void => {
  if (selectedTask.value?.infoHash === task.infoHash) {
    // 如果点击的是已选中的任务，则关闭详情
    selectedTask.value = null
  } else {
    // 更新选中任务并重置速度数据
    selectedTask.value = task
    speedData.value = Array(60).fill(0)

    // 如果已有图表实例，先销毁
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }

    // 初始化新图表
    nextTick(() => {
      initChart()
    })
  }
}

// 监听选中任务变化
watch(selectedTask, (newVal, oldVal) => {
  //未选文件或已完成不监听
  if (selectedTask.value?.selectedSize == selectedTask.value?.selectedTotal) {
    stopUpdateInterval()
    return
  }
  if (newVal) {
    initChart()
    startUpdateInterval()
  } else {
    stopUpdateInterval()
  }
  if (oldVal && !newVal) {
    // 当关闭详情时清理图表
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
  }
})

// 初始化图表
function initChart(): void {
  if (speedChart.value) {
    chartInstance = echarts.init(speedChart.value)
    const option = {
      grid: { top: 20, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', show: false },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'line',
          smooth: true,
          data: speedData.value,
          areaStyle: { color: 'rgba(64, 158, 255, 0.3)' },
          lineStyle: { color: '#409EFF' }
        }
      ]
    }
    chartInstance.setOption(option)
  }
}
//任务详情相关
// 定时更新图表数据
let updateInterval: ReturnType<typeof setInterval> | null = null
function startUpdateInterval(): void {
  updateInterval = setInterval(() => {
    console.log('updateInterval')
    if (selectedTask.value) {
      speedData.value = [...speedData.value.slice(1), selectedTask.value.downloadSpeed || 0]
      chartInstance?.setOption({ series: [{ data: speedData.value }] })
    }
  }, 1000)
}

function stopUpdateInterval(): void {
  if (updateInterval) clearInterval(updateInterval)
}

// 新增速度格式化
function formatSpeed(speed: number): string {
  return formatSize(speed) + '/s'
}

// 组件卸载时清理
onBeforeUnmount(() => {
  stopUpdateInterval()
  if (chartInstance) chartInstance.dispose()
})

//在线播放相关
// 在setup部分添加以下内容
import VideoPlayer from '@renderer/components/VideoPlayer.vue'

const videoVisible = ref(false)
const currentVideoUrl = ref('')
const currentFileName = ref('')

// 视频格式检测
const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv']
const isVideoFile = (fileName: string): boolean => {
  return videoExtensions.some((ext) => fileName.toLowerCase().endsWith(`.${ext}`))
}

// 播放视频
const playVideo = async (file): Promise<void> => {
  try {
    // 获取视频流URL

    if (!selectedTask?.value?.cleared) {
      const torrent = ClientStore.clientTorrentsStore.find(
        (t) => t.infoHash === selectedTask.value?.infoHash
      )
      if (!torrent) {
        ElNotification.error('检测到任务未在进行中，请先点击继续下载')
        return
      }
      const videoFile = torrent?.files.find((f) => f.path === file.path)
      currentVideoUrl.value = videoFile?.streamURL || ''
      currentFileName.value = file.name
      videoVisible.value = true
    } else {
      console.log('已经完成')
      currentVideoUrl.value = join(selectedTask.value.path, file.path)
      currentFileName.value = file.name
      videoVisible.value = true
    }
  } catch (err) {
    ElNotification.error('视频播放失败: ' + err)
  }
}
</script>
<style lang="less" scoped>
//视频弹窗
:deep(.video-dialog) {
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;

  .el-dialog__header {
    display: none;
  }

  .el-dialog__body {
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
  }
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 8px;

  .el-button {
    padding: 4px 8px;
  }
}

.download-container {
  // max-width: 1200px;
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
  .active {
    background-color: rgba(255, 255, 255, 0.1);
  }
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
    max-width: calc(100vw - 520px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-stats {
    display: flex;
    gap: 1.5rem;
    color: #606266;

    .stat-item {
      white-space: nowrap;
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
      background-color: #f5f7fa21;
    }

    &.selected {
      background-color: #ecf5ff2f;
    }
  }

  .file-checkbox {
    margin-right: 1rem;
  }

  .file-info {
    flex-grow: 1;

    .file-name {
      color: white;
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

//任务详情相关
.main-content {
  display: flex;
  gap: 24px;
  transition: all 0.3s ease;

  &.has-selected {
    .task-list-wrapper {
      flex: 1;
      max-width: calc(100% - 400px);
    }
    .task-title {
      max-width: calc(100vw - 820px);
    }
  }
}

.task-list-wrapper {
  flex: 1;
  transition: all 0.3s ease;
}

.task-detail {
  width: 400px;
  background: var(--bg-color-secondary);
  border-left: 1px solid var(--border-color);
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;

  &::-webkit-scrollbar {
    display: none;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      // max-width: 300px;
      // overflow: hidden;
      // text-overflow: ellipsis;
      // white-space: nowrap;
      color: var(--text-color-primary);
    }

    .close-btn {
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      transition: background 0.2s;

      &:hover {
        background: var(--hover-bg);
      }
    }
  }

  .section-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-color-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .files-section {
    .files-container {
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
    }

    .file-item {
      padding: 12px;
      border-bottom: 1px solid var(--border-color-light);
      background: var(--bg-color-tertiary);
      transition: background 0.2s;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--hover-bg-light);
      }

      .file-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .file-name {
        flex: 1;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-color-primary);
      }

      .file-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .file-size {
          font-size: 12px;
          color: var(--text-color-tertiary);
          min-width: 60px;
          text-align: right;
        }
      }
    }
  }

  .stats-section {
    .stats {
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      background: var(--bg-color-tertiary);

      .stat-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;

        &:last-child {
          margin-bottom: 0;
        }

        label {
          font-size: 13px;
          color: var(--text-color-secondary);
        }

        span {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-color-primary);
        }
      }
    }
  }

  .chart-section {
    .chart-container {
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      background: var(--bg-color-tertiary);
    }
  }
}

.file-list {
  margin-bottom: 24px;

  .file-item {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    margin-bottom: 8px;
    background: var(--bg-color);
    border-radius: 6px;

    .file-name-side {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      margin-left: 12px;
      color: var(--text-secondary);
    }
  }
}

.stats {
  margin-bottom: 24px;

  .stat-item {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-color);

    label {
      color: var(--text-secondary);
    }
  }
}

.chart-container {
  background: var(--bg-color);
  border-radius: 8px;
  padding: 16px;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(20px);
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
  text-align: left;
}
.FileDelte {
  margin: 0.24rem 0.12rem;
}

.delete-actions {
  display: flex;
  justify-content: flex-start;
  gap: 0.8rem;
}
</style>
