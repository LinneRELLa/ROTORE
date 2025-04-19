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
        v-if="isProcessing"
        type="warning"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >处理中 {{ processingProgress.toFixed(1) }}%...</el-tag
      >
      <el-tag
        v-if="isPlayingWithMSE"
        type="success"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >MSE 播放中</el-tag
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
          label="默认字幕"
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

    <div v-if="true" class="fallback-prompt">
      <!-- <el-tooltip
        content="使用内置MSE播放器 (可能需要处理时间，需显卡支持视频解码)"
        placement="top"
      >
        <el-button
          type="primary"
          :loading="isLoadingFfmpeg || isProcessing"
          @click="tryMSEPlayback"
        >
          尝试内置播放 (MSE)
          <el-icon><VideoPlay /></el-icon>
        </el-button>
      </el-tooltip> -->
      <el-button type="primary" @click="openSystemPlayer"> 使用外部播放器打开 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElNotification, ElMessage } from 'element-plus'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useFile } from '@renderer/hooks/useFile'
import { FFmpeg } from '@ffmpeg/ffmpeg'
// import { fetchFile, toBlobURL } from '@ffmpeg/util' // 可能不再需要

const { ConfigStore } = useFile()

const props = defineProps({
  videoUrl: String, // 本地文件路径
  fileName: String
})
const emit = defineEmits(['close'])

const videoEl = ref<HTMLVideoElement>()
const ffmpegRef = ref<FFmpeg | null>(null)
const subtitleUrl = ref<string | null>(null) // VTT Blob 的 Object URL
const vttBlobUrl = ref<string | null>(null) // 跟踪 VTT URL 以便释放

// --- 状态相关的 Ref ---
const isLoadingFfmpeg = ref(false) // 仅用于加载 FFmpeg 处理字幕
const isProcessingSubs = ref(false) // 是否正在处理字幕
// const isPlayingWithMSE = ref(false) // 不再需要
const errorMessage = ref<string | null>(null)
const showFallbackOptions = ref(false) // 初始不显示，仅在出错或加载字幕时考虑

// --- FFmpeg 加载逻辑 (保持不变，仅用于字幕) ---
async function loadFfmpeg(): Promise<boolean> {
  if (ffmpegRef.value?.loaded) {
    console.log('FFmpeg 实例已加载。')
    return true
  }

  isLoadingFfmpeg.value = true
  errorMessage.value = null // 清除旧错误
  let coreURL: string | undefined
  let wasmURL: string | undefined

  try {
    const ffmpeg = new FFmpeg()
    // 简化日志处理，仅用于调试字幕提取
    ffmpeg.on('log', ({ message }) => console.log('[FFmpeg Subtitle Log]', message))
    // 进度不再重要，可以移除或保留
    // ffmpeg.on('progress', ({ progress }) => { /* ... */ })

    // --- 从本地文件加载 FFmpeg ---
    const ipcRenderer = window.electron.ipcRenderer
    const FFPath = await ipcRenderer.invoke('getFFPath')
    if (!FFPath || typeof FFPath !== 'string') {
      throw new Error('无法从主进程获取有效的 FFmpeg 基础路径 (getFFPath)。')
    }
    console.log(`[渲染进程] FFmpeg 路径: ${FFPath}`)

    if (!window.nodeAPI?.path?.join || !window.nodeAPI?.fs?.readFile) {
      throw new Error('预加载脚本未正确暴露 nodeAPI.path.join 或 nodeAPI.fs.readFile。')
    }
    const coreJsFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.js')
    const wasmFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.wasm')

    console.log('[渲染进程] 读取 FFmpeg 核心文件...')
    const coreJsData: Buffer = await window.nodeAPI.fs.readFile(coreJsFullPath)
    const wasmData: Buffer = await window.nodeAPI.fs.readFile(wasmFullPath)

    console.log('[渲染进程] 创建 FFmpeg Blob URL...')
    const coreBlob = new Blob([coreJsData], { type: 'text/javascript' })
    const wasmBlob = new Blob([wasmData], { type: 'application/wasm' })
    coreURL = URL.createObjectURL(coreBlob)
    wasmURL = URL.createObjectURL(wasmBlob)

    console.log('[渲染进程] 加载 FFmpeg...')
    await ffmpeg.load({ coreURL, wasmURL })

    ffmpegRef.value = ffmpeg
    console.log('[渲染进程] FFmpeg 成功加载 (仅用于字幕)。')
    return true
  } catch (error: any) {
    console.error('[渲染进程] 加载 FFmpeg 失败:', error)
    errorMessage.value = `加载 FFmpeg 核心失败: ${error.message || String(error)}`
    return false
  } finally {
    if (coreURL) URL.revokeObjectURL(coreURL)
    if (wasmURL) URL.revokeObjectURL(wasmURL)
    isLoadingFfmpeg.value = false
  }
}

// --- 新增：仅提取字幕的函数 ---
async function extractAndSetSubtitles(inputVideoPath: string) {
  if (!ffmpegRef.value || !ffmpegRef.value.loaded) {
    console.warn('FFmpeg 未加载，无法提取字幕。')
    ElNotification.warning({
      title: '提示',
      message: 'FFmpeg尚未加载完成，无法提取字幕。',
      duration: 3000
    })
    return
  }
  if (isProcessingSubs.value) return // 防止重复执行

  isProcessingSubs.value = true
  errorMessage.value = null // 清除字幕处理前的错误
  console.log('开始提取字幕...')

  const inputFileName = `sub-input-${Date.now()}.mkv` // 虚拟文件名
  const vttFileName = `subtitle-${Date.now()}.vtt`

  try {
    // 1. 读取视频文件数据 (FFmpeg wasm 需要文件在 VFS 中)
    console.log(`为提取字幕，读取文件: ${inputVideoPath}`)
    // 确保路径是有效的本地路径
    const inputData: Buffer = await window.nodeAPI.fs.readFile(inputVideoPath)
    const inputUint8Array = new Uint8Array(
      inputData.buffer,
      inputData.byteOffset,
      inputData.byteLength
    )

    // 2. 将文件写入 FFmpeg VFS
    await ffmpegRef.value.writeFile(inputFileName, inputUint8Array)
    console.log(`已将 ${inputFileName} 写入虚拟文件系统 (用于字幕提取)。`)

    // 3. 定义并执行 FFmpeg 字幕提取命令
    const ffmpegSubArgs = [
      '-i',
      inputFileName,
      '-map',
      '0:s:0?', // 映射第一个字幕流 (如果存在)
      '-c:s',
      'webvtt', // 转换为 VTT 格式
      vttFileName
    ]
    console.log('执行 FFmpeg 字幕提取命令:', ffmpegSubArgs.join(' '))
    await ffmpegRef.value.exec(ffmpegSubArgs)
    console.log('FFmpeg 字幕提取完成。')

    // 4. 从 VFS 读取 VTT 字幕文件
    const vttDataUint8Array = await ffmpegRef.value.readFile(vttFileName)
    console.log(`从虚拟文件系统读取 ${vttFileName} (${vttDataUint8Array.length} 字节).`)

    // 5. 创建 VTT Blob URL
    const vttBlob = new Blob([vttDataUint8Array], { type: 'text/vtt' })
    // 清理旧的 VTT Blob URL (如果存在)
    if (vttBlobUrl.value) {
      URL.revokeObjectURL(vttBlobUrl.value)
    }
    vttBlobUrl.value = URL.createObjectURL(vttBlob)
    subtitleUrl.value = vttBlobUrl.value // 更新响应式 ref 以供 <track> 元素使用
    console.log('字幕 VTT Blob URL 已创建:', subtitleUrl.value)

    // 6. 尝试自动启用字幕轨道
    await nextTick() // 等待 DOM 更新 <track> 标签
    if (videoEl.value?.textTracks && videoEl.value.textTracks.length > 0) {
      try {
        videoEl.value.textTracks[0].mode = 'showing'
        console.log('尝试默认启用字幕轨道。')
      } catch (trackError) {
        console.warn('设置字幕轨道模式时出错:', trackError)
      }
    } else {
      console.warn('字幕轨道未找到或尚未加载。')
    }
  } catch (subError: any) {
    console.warn('无法提取字幕:', subError)
    // 如果错误包含 "Subtitle stream not found"，则明确提示
    if (String(subError.message).includes('Subtitle stream not found')) {
      ElNotification.info({
        title: '无内嵌字幕',
        message: '视频文件中未找到内嵌字幕。',
        duration: 3000
      })
    } else {
      ElNotification.warning({
        title: '字幕提取失败',
        message: '未能提取内嵌字幕，将无字幕播放。',
        duration: 3000
      })
    }
    subtitleUrl.value = null // 确保没有指向无效 URL 的 track
    // 字幕提取失败不应设置全局错误状态，允许视频继续播放
  } finally {
    // 7. 清理 VFS 中的文件
    try {
      await ffmpegRef.value.deleteFile(inputFileName)
      await ffmpegRef.value.deleteFile(vttFileName)
      console.log('字幕提取相关的虚拟文件已清理。')
    } catch (cleanupError) {
      console.warn('清理字幕提取的虚拟文件时出错:', cleanupError)
    }
    isProcessingSubs.value = false
    console.log('字幕处理流程结束。')
  }
}

// --- 初始化播放器设置 ---
async function initializePlayer(videoPath: string) {
  console.log('初始化播放器设置...')
  resetPlayerState() // 开始前重置状态
  errorMessage.value = null
  showFallbackOptions.value = false // 初始隐藏

  if (!videoEl.value) {
    errorMessage.value = '视频播放器元素尚未准备好。'
    return
  }

  try {
    // 1. 设置视频源 (尝试直接使用路径)
    // 注意：在 Electron 中，直接使用本地路径可能需要 'file://' 协议
    // 确保 videoPath 是绝对路径
    // const videoSrc = `file://${videoPath.replace(/\\/g, '/')}`; // 转换为 file URL
    // 或者，如果 preload 脚本暴露了转换方法:
    // const videoSrc = await window.electron.ipcRenderer.invoke('get-file-url', videoPath);

    // **最简单的方式（如果Electron配置允许）可能是直接用原始路径**
    // 需要在主进程配置 BrowserWindow 时可能有 `webPreferences: { webSecurity: false }` (不推荐)
    // 或者更好地处理 `file://` 协议。我们先假设直接路径能工作或由Electron正确处理。
    console.log(`设置 video src 为: ${videoPath}`)
    videoEl.value.src = videoPath
    // 监听 video 元素的 canplay 事件，表示视频可以开始播放了
    videoEl.value.oncanplay = () => {
      console.log('视频已准备好播放 (canplay 事件)。')
      // 可以在这里取消静音等操作，如果需要的话
      // videoEl.value.muted = false;
    }

    // 2. 加载 FFmpeg (仅用于字幕)
    const ffmpegLoaded = await loadFfmpeg()

    // 3. 如果 FFmpeg 加载成功，则尝试提取字幕
    if (ffmpegLoaded) {
      // 异步执行，不阻塞播放器初始化
      extractAndSetSubtitles(videoPath).catch((err) => {
        console.error('后台提取字幕时发生未捕获错误:', err)
        // 可以在这里添加额外的错误处理逻辑，如果需要
      })
    } else {
      ElNotification.error({
        title: 'FFmpeg 加载失败',
        message: '无法加载 FFmpeg，将不能提取内嵌字幕。',
        duration: 4000
      })
    }
  } catch (error: any) {
    console.error('初始化播放器时出错:', error)
    errorMessage.value = `无法加载视频: ${error.message}`
    showFallbackOptions.value = true // 显示回退选项
  }
}

// --- 视频错误处理 ---
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
        errorText = '视频解码错误 - 文件可能已损坏或其编码不被此环境支持。'
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorText = '视频源格式不支持。Electron/浏览器无法直接播放此文件。'
        break
      default:
        errorText = `发生未知视频错误 (Code: ${video.error.code})。`
    }
  }
  console.error('Video 元素错误:', errorText)
  errorMessage.value = errorText
  // 发生严重视频错误时，显示回退选项
  showFallbackOptions.value = true
  // 不需要重置播放器状态，因为视频本身加载失败了
}

// --- 关闭播放器 ---
function closePlayer() {
  console.log('请求关闭播放器...')
  resetPlayerState() // 清理资源
  emit('close')
}

// --- 重置播放器状态 (简化版) ---
function resetPlayerState() {
  console.log('正在重置播放器状态...')

  // 暂停视频并重置 src
  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src') // 移除 src
    videoEl.value.load() // 请求浏览器重置 video 元素
    videoEl.value.oncanplay = null // 移除旧的事件监听器
    // 移除可能存在的错误监听器上的额外处理（如果需要）
    console.log('Video 元素已重置。')
  }

  // 释放 VTT Blob URL
  if (vttBlobUrl.value) {
    URL.revokeObjectURL(vttBlobUrl.value)
    console.log('VTT Blob URL 已撤销:', vttBlobUrl.value)
    vttBlobUrl.value = null
  }
  subtitleUrl.value = null // 清除字幕 URL ref

  // 清理 FFmpeg 实例引用（但不终止，终止在 unmount 时进行）
  // ffmpegRef.value = null; // 不在这里清除，unmount时处理

  errorMessage.value = null // 清除错误信息
  isProcessingSubs.value = false // 重置字幕处理状态
  console.log('播放器状态重置完成。')
}

// --- 外部播放器逻辑 (保持不变) ---
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
    ElNotification.success({
      title: '成功',
      message: `正在使用外部播放器播放`,
      duration: 2000
    })
  } catch (err: any) {
    ElNotification.error({
      title: '播放失败',
      message: err.message || String(err),
      duration: 5000
    })
  }
}

// --- 生命周期钩子 ---
onMounted(() => {
  if (props.videoUrl) {
    initializePlayer(props.videoUrl) // 组件挂载后直接尝试初始化
  } else {
    errorMessage.value = '未提供视频文件路径。'
    showFallbackOptions.value = true
  }
})

onBeforeUnmount(() => {
  console.log('组件即将卸载，执行最终清理...')
  resetPlayerState() // 清理状态和 VTT URL
  // 终止 FFmpeg 实例
  if (ffmpegRef.value && ffmpegRef.value.loaded) {
    console.log('在卸载时终止 FFmpeg 实例...')
    try {
      ffmpegRef.value.terminate()
      console.log('FFmpeg 实例已终止。')
    } catch (e) {
      console.warn('卸载组件时终止 ffmpeg 实例出错:', e)
    }
  }
  ffmpegRef.value = null // 清除引用
})

// 监听 videoUrl 变化
watch(
  () => props.videoUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      console.log('视频 URL 已更改，重新初始化播放器。')
      initializePlayer(newUrl) // 使用新 URL 重新初始化
    } else if (!newUrl && oldUrl) {
      // 如果 URL 变成无效，则重置
      resetPlayerState()
      errorMessage.value = '视频文件路径已移除。'
    }
  }
)
</script>
<style scoped lang="less">
/* 如果需要，可以为加载/错误状态添加样式 */
.simple-player {
  /* ... 现有样式 ... */
  background-color: #222; /* 稍暗的背景色 */
  color: #eee;
  border-radius: 8px;
  overflow: hidden;
  max-width: 90vw;
  width: 800px; /* 或你偏好的宽度 */
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #333;
  border-bottom: 1px solid #444;
  h3 {
    margin: 0;
    font-size: 1em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 150px); /* 根据按钮/图标大小调整 */
    color: #eee; /* 确保标题颜色可见 */
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

.video-container {
  position: relative; /* 如果需要在视频上叠加内容，则需要 */
}

.video-element {
  display: block; /* 防止下方出现额外空白 */
  width: 100%;
  /* height: 450px; */ /* 考虑使用 aspect-ratio 或 max-height */
  max-height: calc(80vh - 50px); /* 示例：基于视口限制最大高度 */
  background: black;
}

.fallback-prompt {
  padding: 1rem 2rem;
  text-align: center;
  background: #2a2a2a;
  border-top: 1px solid #444;
  display: flex;
  gap: 1rem;
  justify-content: center;
}

/* 视频下方错误信息的样式 */
.el-alert {
  margin: 10px;
  border-radius: 4px;
}
</style>
