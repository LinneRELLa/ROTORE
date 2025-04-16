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

    <div v-if="showFallbackOptions" class="fallback-prompt">
      <el-tooltip
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
      </el-tooltip>
      <el-button type="primary" @click="openSystemPlayer"> 使用外部播放器打开 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElNotification, ElMessage } from 'element-plus'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useFile } from '@renderer/hooks/useFile' // 假设这个 Hook 提供了 ConfigStore
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util' // fetchFile 可能在某些场景有用

const { ConfigStore } = useFile() // 获取你的配置存储

const props = defineProps({
  videoUrl: String, // 应该是本地文件路径 (例如来自 WebTorrent 下载)
  fileName: String
})
const emit = defineEmits(['close'])

const videoEl = ref<HTMLVideoElement>()
const ffmpegRef = ref<FFmpeg | null>(null) // FFmpeg 实例的 Ref
const mediaSource = ref<MediaSource | null>(null) // MediaSource 实例
const sourceBuffer = ref<SourceBuffer | null>(null) // SourceBuffer 实例
const objectUrl = ref<string | null>(null) // MediaSource 对应的 Object URL
const subtitleUrl = ref<string | null>(null) // VTT Blob 的 Object URL
const vttBlobUrl = ref<string | null>(null) // 跟踪 VTT URL 以便释放

// --- 状态相关的 Ref ---
const isLoadingFfmpeg = ref(false) // 是否正在加载 FFmpeg
const isProcessing = ref(false) // 是否正在处理视频
const processingProgress = ref(0) // 处理进度
const isPlayingWithMSE = ref(false) // 是否正在使用 MSE 播放
const errorMessage = ref<string | null>(null) // 错误信息
const showFallbackOptions = ref(true) // 初始时显示回退选项

// --- FFmpeg 设置 ---
// FFmpeg 核心文件的基础 URL，建议下载到本地或使用稳定 CDN
const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

// 加载 FFmpeg 实例
async function loadFfmpeg(): Promise<boolean> {
  if (ffmpegRef.value?.loaded) {
    console.log('FFmpeg instance already loaded.')
    return true
  }

  isLoadingFfmpeg.value = true
  errorMessage.value = null
  let coreURL: string | undefined // 将 URL 移到 try 外部，以便 finally 中访问
  let wasmURL: string | undefined

  try {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => console.log('[FFmpeg log]', message))
    ffmpeg.on('progress', ({ progress }) => {
      if (isProcessing.value) processingProgress.value = progress * 100
    })

    // 1. 获取路径 (与之前相同)
    const ipcRenderer = window.electron.ipcRenderer
    const FFPath = await ipcRenderer.invoke('getFFPath')
    if (!FFPath || typeof FFPath !== 'string') {
      throw new Error('无法从主进程获取有效的 FFmpeg 基础路径 (getFFPath)。')
    }
    console.log(`[渲染进程] 从主进程获取的 FFmpeg 路径: ${FFPath}`)

    if (!window.nodeAPI?.path?.join || !window.nodeAPI?.fs?.readFile) {
      throw new Error('预加载脚本未正确暴露 nodeAPI.path.join 或 nodeAPI.fs.readFile。')
    }
    const coreJsFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.js')
    const wasmFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.wasm')

    // 2. 读取文件内容到 Buffer (与之前相同)
    console.log('[渲染进程] 正在读取核心 JS 文件...')
    const coreJsData: Buffer = await window.nodeAPI.fs.readFile(coreJsFullPath)
    console.log(`[渲染进程] 从核心 JS 读取了 ${coreJsData.byteLength} 字节。`)

    console.log('[渲染进程] 正在读取 WASM 文件...')
    const wasmData: Buffer = await window.nodeAPI.fs.readFile(wasmFullPath)
    console.log(`[渲染进程] 从 WASM 读取了 ${wasmData.byteLength} 字节。`)

    // 3. 手动创建 Blob 和对应的 Object URL
    console.log('[渲染进程] 正在手动创建 Blob URL...')
    const coreBlob = new Blob([coreJsData], { type: 'text/javascript' })
    const wasmBlob = new Blob([wasmData], { type: 'application/wasm' })

    coreURL = URL.createObjectURL(coreBlob) // 赋值给外部变量
    wasmURL = URL.createObjectURL(wasmBlob) // 赋值给外部变量
    console.log(
      `[渲染进程] 手动创建的 Blob URLs: Core=${coreURL?.substring(0, 100)}..., Wasm=${wasmURL?.substring(0, 100)}...`
    ) // 打印部分 URL

    // 4. 使用手动创建的 Blob URL 加载 FFmpeg
    console.log('[渲染进程] 正在调用 ffmpeg.load() 使用手动创建的 Blob URL...')
    await ffmpeg.load({
      coreURL: coreURL,
      wasmURL: wasmURL
      // workerURL: ..., // 如果需要 worker，也类似处理
    })

    ffmpegRef.value = ffmpeg
    console.log('[渲染进程] FFmpeg 使用手动创建的 Blob URL 成功加载。')
    return true
  } catch (error: any) {
    console.error('[渲染进程] 使用手动创建的 Blob URL 加载 FFmpeg 失败:', error)
    errorMessage.value = `加载 FFmpeg 核心失败: ${error.message || String(error)}`
    // 如果还是 431 错误，提示可能原因
    if (String(error.message).includes('431') || String(error).includes('431')) {
      errorMessage.value += ' (仍然遇到 431 错误，可能是开发服务器对大型 Blob URL 请求处理存在问题)'
    }
    return false
  } finally {
    // 5. 在 finally 块中撤销手动创建的 Object URL
    if (coreURL) {
      console.log('[渲染进程] 撤销手动创建的 coreURL Blob。')
      URL.revokeObjectURL(coreURL)
    }
    if (wasmURL) {
      console.log('[渲染进程] 撤销手动创建的 wasmURL Blob。')
      URL.revokeObjectURL(wasmURL)
    }
    isLoadingFfmpeg.value = false
  }
}

// --- MSE 播放逻辑 ---
// 尝试使用 MSE 进行播放
async function tryMSEPlayback() {
  if (!props.videoUrl || !props.fileName) {
    errorMessage.value = '无效的视频文件路径。'
    return
  }
  if (isLoadingFfmpeg.value || isProcessing.value) return // 防止重复点击

  // 重置状态
  resetMSEState()
  isPlayingWithMSE.value = false
  showFallbackOptions.value = false // 尝试 MSE 时隐藏回退选项
  errorMessage.value = null
  processingProgress.value = 0

  // 1. 按需加载 FFmpeg
  const ffmpegLoaded = await loadFfmpeg()
  if (!ffmpegLoaded || !ffmpegRef.value) {
    showFallbackOptions.value = true // 加载失败则显示回退
    return
  }

  // 2. 检查并设置 MediaSource
  // 重要提示: 这里的编解码器检查非常基础，实际应用需要准确检测文件内的编码！
  const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' // 假设 H.264+AAC
  if (!window.MediaSource || !MediaSource.isTypeSupported(mimeCodec)) {
    errorMessage.value = `浏览器不支持 MediaSource 或所需编解码器 (${mimeCodec})。请确保视频编码为 H.264/AAC 或修改代码以支持其他编码。`
    showFallbackOptions.value = true // 显示回退选项
    return
  }

  mediaSource.value = new MediaSource()
  // 先创建 Object URL，再赋值给 video.src
  objectUrl.value = URL.createObjectURL(mediaSource.value)
  if (videoEl.value) {
    videoEl.value.src = objectUrl.value
    console.log('Video src set to MediaSource Object URL:', objectUrl.value)
  } else {
    errorMessage.value = '视频元素不存在。'
    showFallbackOptions.value = true
    return
  }

  // 添加事件监听器，使用 { once: true } 确保只触发一次
  mediaSource.value.addEventListener('sourceopen', handleSourceOpen, { once: true })
  mediaSource.value.addEventListener('sourceclose', handleSourceClose)
  mediaSource.value.addEventListener('sourceended', handleSourceEnded)
}

// MediaSource 'sourceopen' 事件处理函数
async function handleSourceOpen() {
  if (!mediaSource.value || !ffmpegRef.value || !props.videoUrl) {
    console.error('handleSourceOpen called with invalid state.')
    return
  }
  console.log('MediaSource 已打开，准备接收数据。')

  isProcessing.value = true
  processingProgress.value = 0 // 重置进度

  // 清理上一个 Object URL (虽然理论上 sourceopen 只触发一次，但以防万一)
  if (objectUrl.value && videoEl.value && videoEl.value.src !== objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    console.warn('Revoked previous Object URL during sourceopen.')
  }

  try {
    // 3. 读取输入文件数据 (使用 preload 暴露的 Node API)
    console.log(`正在读取文件: ${props.videoUrl}`)
    // 注意：readFile 返回的是 Buffer，需要转换为 Uint8Array 给 FFmpeg
    const inputData: Buffer = await window.nodeAPI.fs.readFile(props.videoUrl)
    // 从 Buffer 创建 Uint8Array，注意 ArrayBuffer 的共享问题
    const inputUint8Array = new Uint8Array(
      inputData.buffer,
      inputData.byteOffset,
      inputData.byteLength
    )
    const inputFileName = `input-${Date.now()}.mkv` // 虚拟文件名，加时间戳避免冲突
    const outputFileName = `output-${Date.now()}.mp4`
    const vttFileName = `subtitle-${Date.now()}.vtt`

    // 4. 将文件写入 FFmpeg 的虚拟文件系统
    await ffmpegRef.value.writeFile(inputFileName, inputUint8Array)
    console.log(`已将 ${inputFileName} 写入虚拟文件系统。`)

    // 5. 执行 FFmpeg 命令进行重新封装 (尽可能复制编解码器)
    //    重要: 这假设视频是 H.264，音频是 AAC。健壮的方案需要编解码器检测！
    //    使用 'copy' 来避免缓慢的重新编码。
    const ffmpegRemuxArgs = [
      '-i',
      inputFileName,
      '-map',
      '0:v:0?', // 映射第一个视频流 (如果存在)
      '-map',
      '0:a:0?', // 映射第一个音频流 (如果存在)
      '-c:v',
      'copy', // 尝试复制视频编解码器
      '-c:a',
      'copy', // 尝试复制音频编解码器
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof', // MSE 关键参数
      '-f',
      'mp4', // 输出 MP4 格式
      outputFileName
    ]
    console.log('执行 FFmpeg remux 命令:', ffmpegRemuxArgs.join(' '))
    await ffmpegRef.value.exec(ffmpegRemuxArgs)
    console.log('FFmpeg remuxing 完成。')

    // 6. 读取重新封装后的数据
    const outputDataUint8Array = await ffmpegRef.value.readFile(outputFileName)
    console.log(`从虚拟文件系统读取 ${outputFileName} (${outputDataUint8Array.length} bytes).`)

    // 7. 添加 SourceBuffer 并追加数据
    //    警告: 硬编码的 codec 字符串！为了可靠性，需要从 ffprobe/ffmpeg 获取实际编码信息。
    const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' // 再次确认
    if (!MediaSource.isTypeSupported(mimeCodec)) {
      throw new Error(`浏览器不支持此编码组合: ${mimeCodec}`)
    }
    // 确保 MediaSource 仍然处于 'open' 状态
    if (mediaSource.value?.readyState !== 'open') {
      throw new Error('MediaSource 在添加 SourceBuffer 前已关闭。')
    }

    sourceBuffer.value = mediaSource.value.addSourceBuffer(mimeCodec)
    console.log('SourceBuffer 已添加。')

    sourceBuffer.value.addEventListener('updateend', () => {
      // 追加操作完成
      console.log('SourceBuffer update ended.')
      // 检查是否还需要追加数据 (在这个简单实现中，我们一次性追加)
      // 检查 MediaSource 是否仍然是 'open' 状态，并且没有正在进行的更新
      if (!sourceBuffer.value?.updating && mediaSource.value?.readyState === 'open') {
        console.log('数据追加完毕，调用 endOfStream。')
        // 确保在调用 endOfStream 之前没有其他挂起的更新
        try {
          if (mediaSource.value.readyState === 'open') {
            // Double check state
            mediaSource.value.endOfStream()
          }
        } catch (eosError) {
          console.error('调用 endOfStream 时出错:', eosError)
          // 根据错误类型决定是否需要重置状态或通知用户
          if (eosError.name === 'InvalidStateError') {
            console.warn('尝试在非 open 状态下调用 endOfStream。')
          } else {
            errorMessage.value = `结束媒体流时出错: ${eosError.message}`
          }
        }
      }
    })

    sourceBuffer.value.addEventListener('error', (e) => {
      console.error('SourceBuffer 错误:', e)
      errorMessage.value = 'SourceBuffer 出现错误。'
      resetMSEState() // 发生错误时重置
      showFallbackOptions.value = true
    })

    console.log('准备追加数据到 SourceBuffer...')
    // 传递 ArrayBuffer 给 appendBuffer
    sourceBuffer.value.appendBuffer(outputDataUint8Array.buffer)
    // endOfStream 将在 'updateend' 事件中被调用

    // 8. 提取字幕 (作为单独的命令运行)
    try {
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

      const vttDataUint8Array = await ffmpegRef.value.readFile(vttFileName)
      console.log(`从虚拟文件系统读取 ${vttFileName} (${vttDataUint8Array.length} bytes).`)

      // 为 VTT 数据创建 Blob URL
      const vttBlob = new Blob([vttDataUint8Array], { type: 'text/vtt' })
      // 清理旧的 VTT Blob URL (如果存在)
      if (vttBlobUrl.value) {
        URL.revokeObjectURL(vttBlobUrl.value)
      }
      vttBlobUrl.value = URL.createObjectURL(vttBlob)
      subtitleUrl.value = vttBlobUrl.value // 更新响应式 ref 以供 <track> 元素使用
      console.log('字幕 VTT Blob URL 已创建:', subtitleUrl.value)

      // 等待 DOM 更新，然后尝试启用字幕
      await nextTick()
      if (videoEl.value?.textTracks && videoEl.value.textTracks.length > 0) {
        // 尝试将第一个字幕轨道的模式设置为 'showing'
        videoEl.value.textTracks[0].mode = 'showing'
        console.log('尝试默认启用字幕轨道。')
      } else {
        console.warn('未找到 Text Track 或尚未加载。')
      }
    } catch (subError: any) {
      console.warn('无法提取字幕:', subError.message)
      // 字幕提取失败不应阻止视频播放
      ElNotification.warning({
        title: '字幕提取失败',
        message: '未能提取内嵌字幕，将无字幕播放。',
        duration: 3000
      })
      subtitleUrl.value = null // 确保没有指向无效 URL 的 track
    }

    // 9. 清理虚拟文件系统 (可选，但良好实践)
    await ffmpegRef.value.deleteFile(inputFileName)
    await ffmpegRef.value.deleteFile(outputFileName)
    await ffmpegRef.value.deleteFile(vttFileName)
    console.log('虚拟文件系统清理完毕。')

    isPlayingWithMSE.value = true // 标记 MSE 播放已成功开始
  } catch (error: any) {
    console.error('MSE 播放过程中出错:', error)
    errorMessage.value = `处理失败: ${error.message}`
    // 只有在错误确实导致无法播放时才显示回退选项
    if (!(error.message.includes('subtitle') || error.message.includes('字幕'))) {
      // 如果错误不是字幕相关的
      resetMSEState() // 发生错误时清理状态
      showFallbackOptions.value = true // 允许用户选择其他方式
    } else {
      // 如果是字幕错误，只显示警告，不重置播放状态
      console.warn('字幕处理错误，继续播放（如果可能）')
    }
  } finally {
    isProcessing.value = false
    processingProgress.value = 0
  }
}

// MediaSource 'sourceclose' 事件处理函数
function handleSourceClose() {
  console.log('MediaSource 已关闭。')
  // 可以处理意外关闭的情况
}
// MediaSource 'sourceended' 事件处理函数
function handleSourceEnded() {
  console.log('MediaSource 已结束。')
}

// Video 元素 'error' 事件处理函数
function handleVideoError(event: Event) {
  const video = event.target as HTMLVideoElement
  let errorText = '未知视频错误'
  if (video.error) {
    switch (video.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorText = '视频加载被用户中止。'
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorText = '网络错误导致视频加载失败。'
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorText = '视频解码错误 - 文件可能已损坏或编码不被支持 (即使在MSE中)。'
        // 这通常是重新封装后编解码器不兼容的体现
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorText = '视频源格式不被支持 (MediaSource 设置问题?)。'
        break
      default:
        errorText = `发生未知错误 (Code: ${video.error.code})。`
    }
  }
  console.error('Video 元素错误:', errorText, video.error)
  errorMessage.value = errorText
  resetMSEState() // 发生视频错误时清理状态
  showFallbackOptions.value = true // 允许用户选择其他方式
}

// 关闭播放器并清理资源
function closePlayer() {
  resetMSEState() // 清理 MSE 相关资源
  emit('close') // 通知父组件关闭
}

// 重置 MSE 相关的状态和资源
function resetMSEState() {
  console.log('正在重置 MSE 状态...')
  isPlayingWithMSE.value = false

  // 暂停视频并重置 src
  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src') // 先移除 src
    videoEl.value.load() // 重置 video 元素状态
    console.log('Video element reset.')
  }

  // 释放 Object URLs
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
    console.log('MediaSource Object URL revoked.')
  }
  if (vttBlobUrl.value) {
    URL.revokeObjectURL(vttBlobUrl.value)
    vttBlobUrl.value = null
    subtitleUrl.value = null // 同时清除响应式 ref
    console.log('VTT Blob URL revoked.')
  }

  // 关闭 MediaSource (如果处于打开状态)
  if (mediaSource.value && mediaSource.value.readyState === 'open') {
    console.log('Attempting to close MediaSource...')
    try {
      // 尝试在结束流之前移除 SourceBuffer (可能比较复杂且易出错)
      if (sourceBuffer.value && mediaSource.value.sourceBuffers.length > 0) {
        if (Array.from(mediaSource.value.sourceBuffers).includes(sourceBuffer.value)) {
          console.log('Removing SourceBuffer...')
          mediaSource.value.removeSourceBuffer(sourceBuffer.value)
        } else {
          console.log('SourceBuffer already removed or not found.')
        }
      }
      // 再次检查状态，确保在 open 状态下结束流
      if (mediaSource.value.readyState === 'open') {
        console.log('Ending MediaSource stream...')
        mediaSource.value.endOfStream()
      }
    } catch (e) {
      console.warn('在重置期间移除 SourceBuffer 或结束流时出错:', e)
    }
  } else if (mediaSource.value) {
    console.log(`MediaSource already in state: ${mediaSource.value.readyState}`)
  }

  // 清理引用
  mediaSource.value = null
  sourceBuffer.value = null

  // 不在此处终止 ffmpeg 实例，应在组件卸载时进行
  // errorMessage.value = null; // 如果因错误重置，可能需要保留错误信息
  console.log('MSE state reset complete.')
}

// --- 外部播放器逻辑 ---
const openSystemPlayer = async (): Promise<void> => {
  // (此处应为你之前实现的、健壮的打开外部播放器的代码)
  if (!props.videoUrl) {
    ElMessage.error('视频路径无效')
    return
  }
  // 检查播放器路径设置
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
    // 对文件路径和播放器路径进行编码通常更安全
    await window.electron.ipcRenderer.invoke(
      'open-with-external-player',
      encodeURIComponent(props.videoUrl), // 传递原始路径
      encodeURIComponent(ConfigStore.PathConfig.playerPath)
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
onMounted(async () => {
  // 可选：在组件挂载时预加载 ffmpeg？或者等待用户点击。
  // await loadFfmpeg(); // 取消注释以预加载
  if (!props.videoUrl) {
    errorMessage.value = '未提供视频文件路径。'
    showFallbackOptions.value = true
  } else {
    // 初始状态下只显示回退选项，等待用户交互
    showFallbackOptions.value = true
  }
})

onBeforeUnmount(() => {
  resetMSEState() // 清理 MSE 相关资源
  // 终止 FFmpeg 实例 (如果存在且已加载)
  if (ffmpegRef.value && ffmpegRef.value.loaded) {
    console.log('Terminating FFmpeg instance on unmount...')
    try {
      ffmpegRef.value.terminate()
      console.log('FFmpeg instance terminated.')
    } catch (e) {
      console.warn('卸载组件时终止 ffmpeg 实例出错:', e)
    }
  }
  ffmpegRef.value = null
})

// 监听 videoUrl 变化
watch(
  () => props.videoUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      console.log('视频 URL 已更改，重置状态。')
      resetMSEState()
      errorMessage.value = null // 清除旧错误
      showFallbackOptions.value = true // 为新视频显示回退选项
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
