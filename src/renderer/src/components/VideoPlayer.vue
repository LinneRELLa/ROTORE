<template>
  <div class="simple-player">
    <div class="player-header">
      <h3>{{ fileName }}</h3>
      <el-tag
        v-if="isLoadingFfmpeg"
        type="warning"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >加载解码器...</el-tag
      >
      <el-tag
        v-if="isProcessingSubs || isDiscoveringSubtitles"
        type="warning"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >{{ isDiscoveringSubtitles ? '扫描字幕...' : '提取字幕...' }}</el-tag
      >
      <el-icon class="close-btn" @click="closePlayer"><Close /></el-icon>
    </div>

    <div class="video-container">
      <video
        ref="videoEl"
        controls
        autoplay
        muted
        crossorigin="anonymous"
        class="video-element"
        @error="handleVideoError"
      >
        <track
          v-if="subtitleUrl"
          label="选择的字幕"
          kind="subtitles"
          srclang="und"
          :src="subtitleUrl"
          default
        />
      </video>
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
      />
    </div>

    <div class="controls-section subtitle-selection">
      <el-select
        v-model="selectedSubtitleIndex"
        placeholder="选择字幕轨道"
        size="small"
        :disabled="isDiscoveringSubtitles || isProcessingSubs || availableSubtitles.length === 0"
        @change="handleSubtitleSelection"
        style="margin-right: 10px"
        no-data-text="未扫描到字幕轨道"
      >
        <el-option label="无字幕" :value="-1"></el-option>
        <el-option
          v-for="sub in availableSubtitles"
          :key="sub.index"
          :label="sub.label"
          :value="sub.index"
        />
      </el-select>
      <el-button type="primary" @click="openSystemPlayer" size="small">
        使用外部播放器打开
      </el-button>
    </div>

    <!-- <div v-if="showFallbackOptions" class="fallback-prompt">
      <el-button type="primary" @click="openSystemPlayer"> 使用外部播放器打开 </el-button>
    </div> -->
  </div>
</template>

<script setup lang="ts">
import { ElNotification, ElMessage } from 'element-plus'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useFile } from '@renderer/hooks/useFile'
import { FFmpeg } from '@ffmpeg/ffmpeg'

const { ConfigStore } = useFile()

// --- 接口定义 ---
interface SubtitleTrack {
  index: number
  language?: string
  codec?: string
  label: string
}

// --- Props 和 Emits ---
const props = defineProps({
  videoUrl: String,
  fileName: String
})
const emit = defineEmits(['close'])

// --- Refs ---
const videoEl = ref<HTMLVideoElement>()
const ffmpegRef = ref<FFmpeg | null>(null)
const subtitleUrl = ref<string | null>(null)
const vttBlobUrl = ref<string | null>(null)

// --- 状态 Refs ---
const isLoadingFfmpeg = ref(false)
const isDiscoveringSubtitles = ref(false)
const isProcessingSubs = ref(false)
const errorMessage = ref<string | null>(null)
const showFallbackOptions = ref(false)

// --- 字幕相关状态 Refs ---
const availableSubtitles = ref<SubtitleTrack[]>([])
const selectedSubtitleIndex = ref<number | null>(null)

// --- 新增：用于收集所有 FFmpeg 日志的 Ref ---
const ffmpegLogs = ref<string[]>([])

// --- FFmpeg 加载逻辑 (已修改：在此处设置日志监听器) ---
async function loadFfmpeg(): Promise<boolean> {
  if (ffmpegRef.value?.loaded) {
    console.log('FFmpeg 实例已加载。')
    return true
  }

  isLoadingFfmpeg.value = true
  errorMessage.value = null
  let coreURL: string | undefined
  let wasmURL: string | undefined

  try {
    const ffmpeg = new FFmpeg()

    // !!! 在这里一次性添加日志监听器 !!!
    ffmpegLogs.value = [] // 初始化或清空日志数组
    ffmpeg.on('log', ({ message }) => {
      // console.log('[FFmpeg Log]', message); // 可以取消注释用于调试
      ffmpegLogs.value.push(message) // 将日志添加到共享数组中
    })

    // --- 获取 FFmpeg 核心文件路径 ---
    const ipcRenderer = window.electron.ipcRenderer
    const FFPath = await ipcRenderer.invoke('getFFPath')
    if (!FFPath || typeof FFPath !== 'string') {
      throw new Error('无法从主进程获取有效的 FFmpeg 基础路径 (getFFPath)。')
    }
    console.log(`[渲染进程] FFmpeg 路径: ${FFPath}`)

    // --- 检查 Node API ---
    if (!window.nodeAPI?.path?.join || !window.nodeAPI?.fs?.readFile) {
      throw new Error('预加载脚本未正确暴露 nodeAPI.path.join 或 nodeAPI.fs.readFile。')
    }
    const coreJsFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.js')
    const wasmFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.wasm')

    // --- 读取核心文件 ---
    console.log('[渲染进程] 读取 FFmpeg 核心文件...')
    const coreJsData: Buffer = await window.nodeAPI.fs.readFile(coreJsFullPath)
    const wasmData: Buffer = await window.nodeAPI.fs.readFile(wasmFullPath)

    // --- 创建 Blob URL ---
    console.log('[渲染进程] 创建 FFmpeg Blob URL...')
    const coreBlob = new Blob([coreJsData], { type: 'text/javascript' })
    const wasmBlob = new Blob([wasmData], { type: 'application/wasm' })
    coreURL = URL.createObjectURL(coreBlob)
    wasmURL = URL.createObjectURL(wasmBlob)

    // --- 加载 FFmpeg ---
    console.log('[渲染进程] 加载 FFmpeg...')
    await ffmpeg.load({ coreURL, wasmURL })

    ffmpegRef.value = ffmpeg
    console.log('[渲染进程] FFmpeg 成功加载，并已设置日志监听器。')
    return true
  } catch (error: any) {
    console.error('[渲染进程] 加载 FFmpeg 失败:', error)
    errorMessage.value = `加载 FFmpeg 核心失败: ${error.message || String(error)}`
    return false
  } finally {
    // --- 释放 Blob URL ---
    if (coreURL) URL.revokeObjectURL(coreURL)
    if (wasmURL) URL.revokeObjectURL(wasmURL)
    isLoadingFfmpeg.value = false
  }
}

// --- 扫描视频文件中的字幕轨道 (已修改：使用共享日志) ---
async function discoverSubtitleTracks(inputVideoPath: string) {
  if (!ffmpegRef.value || !ffmpegRef.value.loaded) {
    console.warn('FFmpeg 未加载，无法扫描字幕。')
    return
  }
  if (isDiscoveringSubtitles.value) return

  isDiscoveringSubtitles.value = true
  availableSubtitles.value = []
  selectedSubtitleIndex.value = null
  errorMessage.value = null
  console.log('开始扫描字幕轨道...')

  const uniqueInputName = `discover-${Date.now()}.tmp`

  try {
    // !!! 清空之前的日志记录，准备接收本次操作的日志 !!!
    ffmpegLogs.value = []
    // --- 读取视频文件并写入 VFS ---
    const inputData: Buffer = await window.nodeAPI.fs.readFile(inputVideoPath)
    const inputUint8Array = new Uint8Array(
      inputData.buffer,
      inputData.byteOffset,
      inputData.byteLength
    )
    await ffmpegRef.value.writeFile(uniqueInputName, inputUint8Array)

    // --- 执行 FFmpeg 命令获取信息 ---
    try {
      // 此命令预期会因 "-f null -" 出错，但流信息会在错误前打印到日志
      await ffmpegRef.value.exec(['-i', uniqueInputName, '-t', '0.1', '-f', 'null', '-'])
    } catch (execError) {
      console.log('FFmpeg 信息命令完成（预期错误）。正在解析日志以查找字幕。')
    }

    // !!! 使用共享的 ffmpegLogs 进行解析 !!!
    const subs: SubtitleTrack[] = []
    const streamRegex = /^\s*Stream #\d+:(\d+)(?:\((\w+)\))?:\s+Subtitle:\s+(\w+)/
    let subtitleCounter = 0 // <--- 初始化字幕流计数器

    for (const line of ffmpegLogs.value) {
      // 使用全局日志数组
      const match = line.match(streamRegex)
      if (match) {
        // const index = parseInt(match[1], 10)
        const language = match[2] || undefined
        const codec = match[3] || undefined
        const label = `轨道 ${subtitleCounter}${language ? ` (${language})` : ''}${codec ? `: ${codec}` : ''}`
        subs.push({ index: subtitleCounter, language, codec, label })
        console.log(`发现字幕轨道: Index=${subtitleCounter}, Lang=${language}, Codec=${codec}`)
        subtitleCounter++
      }
    }

    availableSubtitles.value = subs // 更新UI列表

    // --- 处理扫描结果 ---
    if (subs.length === 0) {
      ElNotification.info({
        title: '无内嵌字幕',
        message: '视频文件中未扫描到内嵌字幕轨道。',
        duration: 3000
      })
      selectedSubtitleIndex.value = -1
    } else {
      selectedSubtitleIndex.value = -1 // 默认选择 "无字幕"
    }
  } catch (error: any) {
    console.error('扫描字幕轨道失败:', error)
    ElNotification.error({
      title: '扫描字幕失败',
      message: `无法扫描字幕轨道: ${error.message || String(error)}`,
      duration: 4000
    })
    errorMessage.value = '扫描字幕轨道时出错。'
    selectedSubtitleIndex.value = -1
  } finally {
    // --- 清理 VFS 中的临时文件 ---
    try {
      if (ffmpegRef.value) {
        await ffmpegRef.value.deleteFile(uniqueInputName)
      }
    } catch (cleanupError) {
      console.warn('清理字幕扫描的虚拟文件时出错:', cleanupError)
    }
    isDiscoveringSubtitles.value = false // 结束扫描状态
    console.log('字幕扫描流程结束。')
    // 可以选择在此处再次清空日志： ffmpegLogs.value = []; 避免日志累积过大
  }
}

// --- 提取指定索引的字幕轨道并设置为 VTT ---
async function extractAndSetSubtitles(inputVideoPath: string, subtitleIndex: number) {
  if (!ffmpegRef.value || !ffmpegRef.value.loaded) {
    console.warn('FFmpeg 未加载，无法提取字幕。')
    return
  }
  if (isProcessingSubs.value) {
    console.warn('已经在处理字幕，请稍候...')
    return
  }

  isProcessingSubs.value = true
  errorMessage.value = null
  console.log(`开始提取字幕轨道索引: ${subtitleIndex}...`)

  clearSubtitleTrack() // 清理旧字幕

  const inputFileName = `sub-input-${Date.now()}.mkv`
  const vttFileName = `subtitle-${Date.now()}.vtt`

  try {
    // --- 写入 VFS ---
    const inputData: Buffer = await window.nodeAPI.fs.readFile(inputVideoPath)
    const inputUint8Array = new Uint8Array(
      inputData.buffer,
      inputData.byteOffset,
      inputData.byteLength
    )
    await ffmpegRef.value.writeFile(inputFileName, inputUint8Array)

    // --- 执行提取命令 ---
    // 清空日志，以便观察本次提取操作的日志（如果需要）
    // ffmpegLogs.value = [];
    ffmpegLogs.value = [] // 清空全局日志数组
    const ffmpegSubArgs = [
      '-loglevel',
      'verbose', // <--- 添加日志级别参数 ('verbose' 或 'debug')
      '-i',
      inputFileName,
      '-map',
      `0:s:${subtitleIndex}?`,
      '-c:s',
      'webvtt',
      vttFileName
    ]
    console.log('执行 FFmpeg 字幕提取命令:', ffmpegSubArgs.join(' '))
    await ffmpegRef.value.exec(ffmpegSubArgs)
    console.log(`FFmpeg 字幕轨道 ${subtitleIndex} 提取完成。`, ffmpegLogs.value)

    try {
      console.log('尝试列出 VFS 根目录内容...')
      const files = await ffmpegRef.value.listDir('.') // 列出根目录 '.'
      console.log('VFS 根目录内容:', files)
      // 检查 VTT 文件是否在列表中
      const vttFileExists = files.some((f) => f.name === vttFileName && !f.isDir)
      console.log(`目标 VTT 文件 (${vttFileName}) 是否存在于列表: ${vttFileExists}`)
    } catch (listDirError) {
      console.error('列出 VFS 目录时出错:', listDirError)
    }

    // --- 读取 VTT 文件 ---
    const vttDataUint8Array = await ffmpegRef.value.readFile(vttFileName)

    // --- 创建 Blob URL ---
    const vttBlob = new Blob([vttDataUint8Array], { type: 'text/vtt' })
    vttBlobUrl.value = URL.createObjectURL(vttBlob)
    subtitleUrl.value = vttBlobUrl.value

    console.log('字幕 VTT Blob URL 已创建:', subtitleUrl.value)

    // --- 尝试启用字幕 ---
    await nextTick()
    enableSubtitleTrack()
  } catch (subError: any) {
    console.error(`提取字幕轨道 ${subtitleIndex} 失败:`, subError)
    ElNotification.error({
      title: '字幕提取失败',
      message: `无法提取所选字幕轨道 (${subtitleIndex})。 ${subError.message || String(subError)}`,
      duration: 4000
    })
    clearSubtitleTrack() // 提取失败也要清理
  } finally {
    // --- 清理 VFS ---
    try {
      if (ffmpegRef.value) {
        await ffmpegRef.value.deleteFile(inputFileName)
        await ffmpegRef.value.deleteFile(vttFileName)
      }
    } catch (cleanupError) {
      console.warn('清理字幕提取的虚拟文件时出错:', cleanupError)
    }
    isProcessingSubs.value = false
    console.log('字幕处理流程结束。')
  }
}

// --- 辅助函数 - 清除当前字幕轨道 ---
function clearSubtitleTrack() {
  if (vttBlobUrl.value) {
    URL.revokeObjectURL(vttBlobUrl.value)
    console.log('旧的 VTT Blob URL 已撤销:', vttBlobUrl.value)
    vttBlobUrl.value = null
  }
  subtitleUrl.value = null

  if (videoEl.value?.textTracks) {
    try {
      for (let i = 0; i < videoEl.value.textTracks.length; i++) {
        if (videoEl.value.textTracks[i].kind === 'subtitles') {
          videoEl.value.textTracks[i].mode = 'disabled'
        }
      }
    } catch (e) {
      console.warn('尝试禁用字幕轨道时出错:', e)
    }
  }
}

// --- 辅助函数 - 启用当前字幕轨道 ---
async function enableSubtitleTrack() {
  await nextTick()
  if (videoEl.value?.textTracks && videoEl.value.textTracks.length > 0) {
    let trackSet = false
    for (let i = videoEl.value.textTracks.length - 1; i >= 0; i--) {
      if (videoEl.value.textTracks[i].kind === 'subtitles') {
        try {
          videoEl.value.textTracks[i].mode = 'showing'
          console.log(`尝试启用字幕轨道 ${i} (mode=showing).`)
          trackSet = true
          break
        } catch (trackError) {
          console.warn('设置字幕轨道模式时出错:', trackError)
          break
        }
      }
    }
    if (!trackSet) {
      console.warn('未能找到或启用目标字幕轨道。')
    }
  } else {
    console.warn('视频 TextTracks 不可用或为空，无法自动启用字幕。')
  }
}

// --- 处理字幕选择变化的事件处理器 ---
async function handleSubtitleSelection(selectedIndex: number | null | string) {
  const index = typeof selectedIndex === 'string' ? parseInt(selectedIndex, 10) : selectedIndex
  console.log(`用户选择字幕轨道索引: ${index}`)
  selectedSubtitleIndex.value = index

  clearSubtitleTrack() // 立即移除旧字幕

  if (index !== null && index >= 0 && props.videoUrl) {
    await extractAndSetSubtitles(props.videoUrl, index) // 提取新选择的字幕
  } else {
    console.log('已选择 "无字幕" 或索引无效，不提取新字幕。')
  }
}

// --- 初始化播放器设置 ---
async function initializePlayer(videoPath: string) {
  console.log('初始化播放器设置...')
  resetPlayerState()
  errorMessage.value = null
  showFallbackOptions.value = false

  if (!videoEl.value) {
    errorMessage.value = '视频播放器元素尚未准备好。'
    return
  }

  try {
    // 1. 设置视频源
    console.log(`设置 video src 为: ${videoPath}`)
    videoEl.value.src = videoPath
    videoEl.value.oncanplay = () => {
      console.log('视频已准备好播放 (canplay 事件)。')
    }

    // 2. 加载 FFmpeg
    const ffmpegLoaded = await loadFfmpeg() // loadFfmpeg 内部已设置好日志监听

    // 3. 扫描字幕
    if (ffmpegLoaded) {
      discoverSubtitleTracks(videoPath).catch((err) => {
        // 异步扫描
        console.error('后台扫描字幕时发生未捕获错误:', err)
        ElNotification.warning({
          title: '警告',
          message: '扫描字幕轨道时遇到问题。',
          duration: 3000
        })
        availableSubtitles.value = []
        selectedSubtitleIndex.value = -1
      })
    } else {
      // FFmpeg 加载失败
      ElNotification.error({
        title: 'FFmpeg 加载失败',
        message: '无法加载 FFmpeg，将不能扫描或提取内嵌字幕。',
        duration: 4000
      })
      availableSubtitles.value = []
      selectedSubtitleIndex.value = -1
    }
  } catch (error: any) {
    console.error('初始化播放器时出错:', error)
    errorMessage.value = `无法加载视频: ${error.message}`
    showFallbackOptions.value = true
  }
}

// --- 视频错误处理 (未改变) ---
function handleVideoError(event: Event) {
  const video = event.target as HTMLVideoElement
  let errorText = '未知视频错误'
  if (video.error) {
    console.error('HTMLVideoElement 错误对象:', video.error)
    switch (video.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorText = '视频加载被用户中止。'
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorText = '网络错误导致视频加载失败。'
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorText = '视频解码错误 - 文件可能已损坏或编码不支持。'
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorText = '视频源格式不支持。'
        break
      default:
        errorText = `发生未知视频错误 (Code: ${video.error.code})。`
    }
  }
  console.error('Video 元素错误:', errorText)
  errorMessage.value = errorText
  showFallbackOptions.value = true
}

// --- 关闭播放器 (未改变) ---
function closePlayer() {
  console.log('请求关闭播放器...')
  resetPlayerState()
  emit('close')
}

// --- 重置播放器状态 (已更新) ---
function resetPlayerState() {
  console.log('正在重置播放器状态...')

  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src')
    videoEl.value.load()
    videoEl.value.oncanplay = null
    console.log('Video 元素已重置。')
  }

  clearSubtitleTrack() // 清理字幕状态和 URL
  availableSubtitles.value = []
  selectedSubtitleIndex.value = null

  errorMessage.value = null
  isProcessingSubs.value = false
  isDiscoveringSubtitles.value = false
  // ffmpegLogs.value = []; // 可以在这里清空累积的日志，如果需要的话

  console.log('播放器状态重置完成。')
}

// --- 外部播放器逻辑 (未改变) ---
const openSystemPlayer = async (): Promise<void> => {
  if (!props.videoUrl) {
    ElMessage.error('视频路径无效')
    return
  }
  if (
    !ConfigStore.PathConfig.playerPath ||
    !window.nodeAPI.fs.existsSync(ConfigStore.PathConfig.playerPath)
  ) {
    ElNotification.error({
      title: '播放失败',
      message: '设置的播放器路径无效或不存在，请前往设置页面设置路径',
      duration: 5000
    })
    return
  }
  try {
    await window.electron.ipcRenderer.invoke(
      'open-with-external-player',
      props.videoUrl,
      ConfigStore.PathConfig.playerPath
    )
    ElNotification.success({ title: '成功', message: `正在使用外部播放器播放`, duration: 2000 })
  } catch (err: any) {
    ElNotification.error({ title: '播放失败', message: err.message || String(err), duration: 5000 })
  }
}

// --- 生命周期钩子 (已更新) ---
onMounted(() => {
  if (props.videoUrl) {
    initializePlayer(props.videoUrl)
  } else {
    errorMessage.value = '未提供视频文件路径。'
    showFallbackOptions.value = true
    availableSubtitles.value = []
    selectedSubtitleIndex.value = -1
  }
})

onBeforeUnmount(() => {
  console.log('组件即将卸载，执行最终清理...')
  resetPlayerState()

  if (ffmpegRef.value && ffmpegRef.value.loaded) {
    console.log('在卸载时终止 FFmpeg 实例...')
    try {
      // ffmpegRef.value.terminate(); // 酌情取消注释
      console.log('FFmpeg 实例引用已清除。')
    } catch (e) {
      console.warn('卸载组件时终止/清理 ffmpeg 实例引用出错:', e)
    }
  }
  ffmpegRef.value = null
})

// --- 监听 videoUrl 变化 (逻辑未变) ---
watch(
  () => props.videoUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      console.log('视频 URL 已更改，重新初始化播放器。')
      initializePlayer(newUrl)
    } else if (!newUrl && oldUrl) {
      resetPlayerState()
      errorMessage.value = '视频文件路径已移除。'
    }
  }
)
</script>

<style scoped lang="less">
/* 控制区域样式 */
.controls-section {
  padding: 8px 16px;
  background: #2a2a2a;
  border-top: 1px solid #444;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-shrink: 0;
}

.subtitle-selection .el-select {
  width: 200px;
}

/* 基础播放器样式 */
.simple-player {
  background-color: #222;
  color: #eee;
  border-radius: 8px;
  overflow: hidden;
  max-width: 90vw;
  width: 800px;
  display: flex;
  flex-direction: column;
  height: 600px; /* Adjust as needed */
  max-height: 85vh;
}

/* 播放器头部样式 */
.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #333;
  border-bottom: 1px solid #444;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 1em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 200px);
    color: #eee;
  }

  .el-tag {
    margin-left: 8px;
  }
  .close-btn {
    cursor: pointer;
    font-size: 1.2em;
    color: #ccc;
    &:hover {
      color: #fff;
    }
  }
}

/* 视频容器样式 */
.video-container {
  position: relative;
  flex-grow: 1;
  background: black;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

/* 视频元素样式 */
.video-element {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain; /* 保持宽高比 */
}

/* 回退选项样式 */
.fallback-prompt {
  padding: 1rem 2rem;
  text-align: center;
  background: #2a2a2a;
  border-top: 1px solid #444;
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-shrink: 0;
}

/* 错误提示样式 */
.el-alert {
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  z-index: 10;
  border-radius: 4px;
}
</style>
