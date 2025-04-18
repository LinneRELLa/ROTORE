<template>
  <div class="simple-player">
    <div class="player-header">
      <h3>{{ fileName }}</h3>
      <el-tag
        v-if="isLoadingFfmpeg"
        type="info"
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
        >处理中 (Remux) {{ processingProgress.toFixed(1) }}%...</el-tag
      >
      <el-tag
        v-if="isPlayingWithMSE"
        type="success"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >MSE 播放中 (Remux)</el-tag
      >
      <el-tag
        v-if="isPlayingDirectly"
        type="success"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >直接播放中</el-tag
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
        @canplay="handleVideoCanPlay"
        @ended="handleVideoEnded"
      >
        <track
          v-for="(sub, index) in subtitlesInfo"
          :key="sub.url"
          :label="sub.label"
          kind="subtitles"
          :srclang="sub.lang || 'und'"
          :src="sub.url"
          :default="index === 0"
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
        content="尝试快速转换容器格式 (如 MKV->MP4)，保留原始音视频编码。需要浏览器/显卡支持视频解码。将提取所有字幕。"
        placement="top"
      >
        <el-button
          type="primary"
          :loading="isLoadingFfmpeg || isProcessing"
          :disabled="isTranscoding"
          @click="tryMSEPlayback"
        >
          内置播放 (Remux)
          <el-icon><VideoPlay /></el-icon>
        </el-button>
      </el-tooltip>

      <el-button type="success" @click="openSystemPlayer"> 外部播放器 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElNotification, ElMessage } from 'element-plus'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useFile } from '@renderer/hooks/useFile'
import { FFmpeg } from '@ffmpeg/ffmpeg'
// import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { Folder, VideoPlay, Check, Close, Select, Cpu } from '@element-plus/icons-vue'

// --- 定义字幕信息结构 ---
interface SubtitleInfo {
  url: string // VTT Blob URL
  label: string // 用于显示的标签 (如: "中文", "日语", "轨道 3")
  lang: string // BCP 47 语言代码 (如: "zh", "ja", "en")
  index: number // 在原始文件中的索引
  // isDefault: boolean; // 是否是默认轨道 (可以根据需要添加)
}

const { ConfigStore } = useFile()

const props = defineProps({
  videoUrl: String,
  fileName: String
})
const emit = defineEmits(['close'])

// --- DOM 引用和核心对象 ---
const videoEl = ref<HTMLVideoElement>()
const ffmpegRef = ref<FFmpeg | null>(null)
const mediaSource = ref<MediaSource | null>(null)
const sourceBuffer = ref<SourceBuffer | null>(null)

// --- URL 管理 ---
const mseObjectUrl = ref<string | null>(null)
const directPlaybackUrl = ref<string | null>(null)
// --- 字幕状态修改: 使用数组存储多个字幕信息 ---
const subtitlesInfo = ref<SubtitleInfo[]>([]) // 存储所有提取的字幕信息

// --- 状态 Refs (移除软解相关) ---
const isLoadingFfmpeg = ref(false)
const isProcessing = ref(false) // 仅用于 Remux
const isTranscoding = ref(false) // 保留变量以禁用按钮，但功能移除
const processingProgress = ref(0)
const isPlayingWithMSE = ref(false) // 仅用于 Remux
// const isPlayingWithSoftwareMSE = ref(false) // 移除
const isPlayingDirectly = ref(false)
const errorMessage = ref<string | null>(null)
const showFallbackOptions = ref(false)
// const intendedMSEMode = ref<'remux' | 'transcode' | null>(null); // 移除

// --- 加载 FFmpeg (保持不变) ---
async function loadFfmpeg(): Promise<boolean> {
  // ... (代码与之前相同) ...
  if (ffmpegRef.value?.loaded) {
    return true
  }
  isLoadingFfmpeg.value = true
  errorMessage.value = null
  let coreURL: string | undefined, wasmURL: string | undefined
  try {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => console.log('[FFmpeg 日志]', message))
    ffmpeg.on('progress', ({ progress }) => {
      if (isProcessing.value /*|| isTranscoding.value*/) processingProgress.value = progress * 100
    })
    const ipcRenderer = window.electron.ipcRenderer
    const FFPath = await ipcRenderer.invoke('getFFPath')
    if (!FFPath || typeof FFPath !== 'string') throw new Error('...')
    if (!window.nodeAPI?.path?.join || !window.nodeAPI?.fs?.readFile) throw new Error('...')
    const coreJsFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.js')
    const wasmFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.wasm')
    console.log('[渲染进程] 读取核心 JS...')
    const coreJsData: Buffer = await window.nodeAPI.fs.readFile(coreJsFullPath)
    console.log('[渲染进程] 读取 WASM...')
    const wasmData: Buffer = await window.nodeAPI.fs.readFile(wasmFullPath)
    console.log('[渲染进程] 创建 Blob URL...')
    const coreBlob = new Blob([coreJsData], { type: 'text/javascript' })
    const wasmBlob = new Blob([wasmData], { type: 'application/wasm' })
    coreURL = URL.createObjectURL(coreBlob)
    wasmURL = URL.createObjectURL(wasmBlob)
    console.log('[渲染进程] 调用 ffmpeg.load()...')
    await ffmpeg.load({ coreURL, wasmURL })
    ffmpegRef.value = ffmpeg
    console.log('[渲染进程] FFmpeg 加载成功。')
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

// --- 直接播放 MP4 (保持不变) ---
async function tryDirectPlayback() {
  // ... (代码与之前相同) ...
  if (!props.videoUrl || !videoEl.value) {
    errorMessage.value = '...'
    showFallbackOptions.value = true
    return
  }
  console.log('尝试直接播放 MP4:', props.videoUrl)
  resetPlaybackState()
  errorMessage.value = null
  isPlayingDirectly.value = false
  try {
    const fileData: Buffer = await window.nodeAPI.fs.readFile(props.videoUrl)
    const blob = new Blob([fileData], { type: 'video/mp4' })
    if (directPlaybackUrl.value) URL.revokeObjectURL(directPlaybackUrl.value)
    directPlaybackUrl.value = URL.createObjectURL(blob)
    videoEl.value.src = directPlaybackUrl.value
    console.log('MP4 Blob URL 设置为 video.src:', directPlaybackUrl.value)
  } catch (error: any) {
    console.error('直接播放 MP4 时出错:', error)
    errorMessage.value = `...`
    resetPlaybackState()
    showFallbackOptions.value = true
  }
}

// --- MSE 播放 (Remux) 逻辑 ---
async function tryMSEPlayback() {
  if (!props.videoUrl || !props.fileName) {
    errorMessage.value = '...'
    return
  }
  if (isLoadingFfmpeg.value || isProcessing.value || isTranscoding.value) return // 防止并发

  resetPlaybackState() // 清理状态
  // intendedMSEMode.value = 'remux'; // 移除或注释掉
  isPlayingWithMSE.value = false
  showFallbackOptions.value = false
  errorMessage.value = null
  processingProgress.value = 0

  // 1. 加载 FFmpeg
  const ffmpegLoaded = await loadFfmpeg()
  if (!ffmpegLoaded || !ffmpegRef.value) {
    showFallbackOptions.value = true
    /* intendedMSEMode.value = null; */ return
  }

  // 2. 检查 MediaSource 支持
  const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
  if (!window.MediaSource || !MediaSource.isTypeSupported(mimeCodec)) {
    errorMessage.value = `...`
    showFallbackOptions.value = true
    /* intendedMSEMode.value = null; */ return
  }

  // 3. 创建 MediaSource 实例
  mediaSource.value = new MediaSource()
  mseObjectUrl.value = URL.createObjectURL(mediaSource.value)
  if (videoEl.value) {
    videoEl.value.src = mseObjectUrl.value
    console.log('[Remux] Video src 设置为 MediaSource Object URL:', mseObjectUrl.value)
  } else {
    errorMessage.value = '...'
    showFallbackOptions.value = true
    /* intendedMSEMode.value = null; */ return
  }

  // 4. 添加事件监听器
  mediaSource.value.addEventListener('sourceopen', handleSourceOpen, { once: true })
  mediaSource.value.addEventListener('sourceclose', handleSourceClose)
  mediaSource.value.addEventListener('sourceended', handleSourceEnded)
}

// --- MediaSource 'sourceopen' 处理函数 (Remux) ---
async function handleSourceOpen() {
  if (!mediaSource.value || !ffmpegRef.value || !props.videoUrl || !props.fileName) {
    console.error('...')
    errorMessage.value = '...'
    showFallbackOptions.value = true
    resetPlaybackState()
    return
  }
  console.log('[Remux] MediaSource 已打开，准备接收数据。')

  isProcessing.value = true
  isTranscoding.value = false
  processingProgress.value = 0

  // 检查旧 URL
  if (mseObjectUrl.value && videoEl.value && videoEl.value.src !== mseObjectUrl.value) {
    URL.revokeObjectURL(mseObjectUrl.value)
    console.warn('...')
  }

  // 定义本次操作的文件名
  const inputFileName = `input-rm-${Date.now()}.${props.fileName.split('.').pop() || 'tmp'}`
  const outputFileName = `output-rm-${Date.now()}.mp4`
  // VTT 文件名将在探测函数内部生成

  try {
    // 1. 读取并写入输入文件到虚拟文件系统
    console.log(`[Remux] 读取文件: ${props.videoUrl}`)
    const inputData: Buffer = await window.nodeAPI.fs.readFile(props.videoUrl)
    const inputUint8Array = new Uint8Array(
      inputData.buffer,
      inputData.byteOffset,
      inputData.byteLength
    )
    await ffmpegRef.value.writeFile(inputFileName, inputUint8Array)
    console.log(`[Remux] 已将 ${inputFileName} 写入虚拟文件系统。`)

    // 2. 执行 FFmpeg Remux 命令
    const ffmpegRemuxArgs = [
      '-i',
      inputFileName,
      '-map',
      '0:v:0?',
      '-map',
      '0:a:0?',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      outputFileName
    ]
    console.log('[Remux] 执行 FFmpeg remux 命令:', ffmpegRemuxArgs.join(' '))
    await ffmpegRef.value.exec(ffmpegRemuxArgs)
    console.log('[Remux] FFmpeg remuxing 完成。')

    // 3. 读取 Remux 后的数据
    const outputDataUint8Array = await ffmpegRef.value.readFile(outputFileName)
    console.log(`[Remux] 读取 ${outputFileName} (${outputDataUint8Array.length} bytes).`)

    // 4. 添加 SourceBuffer 并追加数据
    const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    if (!MediaSource.isTypeSupported(mimeCodec)) {
      throw new Error(`...`)
    }
    if (mediaSource.value?.readyState !== 'open') {
      throw new Error('...')
    }
    sourceBuffer.value = mediaSource.value.addSourceBuffer(mimeCodec)
    console.log('[Remux] SourceBuffer 已添加。')
    sourceBuffer.value.addEventListener('updateend', () => {
      /* ... (与之前相同) ... */ if (
        !sourceBuffer.value?.updating &&
        mediaSource.value?.readyState === 'open'
      ) {
        try {
          if (mediaSource.value.readyState === 'open') {
            mediaSource.value.endOfStream()
          }
        } catch (eosError: any) {
          console.error('[Remux] endOfStream 出错:', eosError)
          if (eosError.name !== 'InvalidStateError') errorMessage.value = `...`
        }
      }
    })
    sourceBuffer.value.addEventListener('error', (e) => {
      console.error('[Remux] SourceBuffer 错误:', e)
      errorMessage.value = '...'
      resetPlaybackState()
      showFallbackOptions.value = true
    })
    console.log('[Remux] 准备追加数据到 SourceBuffer...')
    sourceBuffer.value.appendBuffer(outputDataUint8Array.buffer)

    // 5. --- 修改点: 调用探测和提取所有字幕的函数 ---
    console.log('[Remux] 开始探测和提取所有字幕...')
    try {
      const extractedSubs = await probeAndExtractAllSubtitles(ffmpegRef.value, inputFileName)
      subtitlesInfo.value = extractedSubs // 更新状态
      console.log(`[Remux] 成功提取 ${extractedSubs.length} 个字幕轨道。`)
      // 尝试启用第一个字幕（如果存在）
      await nextTick()
      if (videoEl.value?.textTracks && videoEl.value.textTracks.length > 0) {
        const firstTrack = videoEl.value.textTracks[0]
        if (firstTrack) firstTrack.mode = 'showing' // 默认显示第一个
        console.log('[Remux] 尝试默认启用第一个字幕轨道。')
      }
    } catch (probeError: any) {
      console.error('[Remux] 探测或提取字幕时发生错误:', probeError)
      ElNotification.error({
        title: '字幕处理失败',
        message: probeError.message || '无法处理字幕信息',
        duration: 4000
      })
      subtitlesInfo.value = [] // 清空字幕信息
    }

    // 6. 清理虚拟文件系统
    await ffmpegRef.value.deleteFile(inputFileName)
    await ffmpegRef.value.deleteFile(outputFileName)
    // VTT 文件已在 probeAndExtractAllSubtitles 内部清理
    console.log('[Remux] 虚拟文件系统清理完毕 (input/output)。')
  } catch (error: any) {
    console.error('[Remux] 播放过程中出错:', error)
    errorMessage.value = `处理失败 (Remux): ${error.message}`
    resetPlaybackState()
    showFallbackOptions.value = true
  } finally {
    isProcessing.value = false
    processingProgress.value = 0
  }
}

// --- 移除软解相关函数 ---
// async function trySoftwareDecodeMSEPlayback() { /* ... */ }
// async function handleSourceOpenForSoftwareDecode() { /* ... */ }

// --- 新增: 探测并提取所有字幕的函数 ---
async function probeAndExtractAllSubtitles(
  ffmpeg: FFmpeg,
  inputFilename: string
): Promise<SubtitleInfo[]> {
  const extractedSubtitles: SubtitleInfo[] = []
  const probeLogs: string[] = []
  let probeError: Error | null = null

  // // 1. 运行探测命令并捕获日志
  const logListener = ({ message }: { message: string }) => {
    probeLogs.push(message)
  }
  ffmpeg.on('log', logListener) // 注册日志监听器

  console.log(`[字幕探测] 开始探测文件: ${inputFilename}`)
  try {
    // 执行一个快速的命令，其日志输出会包含流信息
    // '-find_stream_info' 可能有助于确保信息完整，但通常 '-i' 就够了
    await ffmpeg.exec(['-i', inputFilename, '-hide_banner', '-f', 'null', '-']) // '-f null -' 避免实际处理
  } catch (error: any) {
    // 有些视频即使探测也会报错，但日志可能仍然包含信息，所以不直接抛出
    console.warn(`[字幕探测] 探测命令执行期间出现错误 (可能是正常的):`, error.message)
    probeError = error // 记录错误，但不中断
  } finally {
    ffmpeg.off('log', logListener) // *必须* 移除监听器
    console.log(`[字幕探测] 探测命令完成，共捕获 ${probeLogs.length} 条日志。`)
  }

  // 2. 解析日志，查找字幕流信息
  const subtitleStreams: { index: number; lang?: string; title?: string }[] = []
  // 正则表达式匹配类似 "Stream #0:2(jpn): Subtitle: ass (default)" 的行
  // \s*Stream\s+#(\d+):(\d+)(?:\((.*?)\))?:\s+Subtitle:\s+(.*?)(\s+\(default\))?
  // 分组 1: 文件索引 (通常是 0)
  // 分组 2: 流索引 (我们要的)
  // 分组 3: 语言代码 (可选)
  // 分组 4: 编码器名称 (我们不太关心)
  // 分组 5: 是否是默认轨 (可选)
  const streamRegex = /^\s*Stream\s+#\d+:(\d+)(?:\((.*?)\))?:\s+Subtitle:/
  const metadataTitleRegex = /^\s*Metadata:\s*title\s*:\s*(.*)/
  let currentStreamIndex = -1

  console.log('[字幕探测] 开始解析日志...')
  for (const log of probeLogs) {
    const match = log.match(streamRegex)
    if (match) {
      currentStreamIndex = parseInt(match[1], 10)
      const lang = match[2]?.trim() || undefined // 提取语言代码
      subtitleStreams.push({ index: currentStreamIndex, lang })
      console.log(`[字幕探测] 发现字幕轨道，索引: ${currentStreamIndex}, 语言: ${lang}`)
    } else if (currentStreamIndex !== -1 && subtitleStreams.length > 0) {
      // 尝试匹配紧随其后的 Metadata title 行
      const titleMatch = log.match(metadataTitleRegex)
      if (titleMatch) {
        const lastStream = subtitleStreams[subtitleStreams.length - 1]
        if (lastStream.index === currentStreamIndex && !lastStream.title) {
          // 确保是当前流且标题未设置
          lastStream.title = titleMatch[1].trim()
          console.log(`[字幕探测]   轨道 ${currentStreamIndex} 标题: ${lastStream.title}`)
          currentStreamIndex = -1 // 重置当前流索引，避免误匹配
        }
      }
    }
  }

  if (subtitleStreams.length === 0 && probeError) {
    // 如果探测本身就报错了，并且没找到任何字幕流，则认为探测失败
    throw new Error(`探测失败，无法获取流信息: ${probeError.message}`)
  }
  console.log(`[字幕探测] 解析完成，找到 ${subtitleStreams.length} 个字幕轨道。`)

  // 3. 循环提取每个字幕轨道
  for (const stream of subtitleStreams) {
    const { index, lang, title } = stream
    const outputVttFilename = `subtitle_${index}_${lang || 'und'}_${Date.now()}.vtt`
    const label = title || (lang ? `语言: ${lang}` : `轨道 ${index + 1}`) // 生成显示标签

    console.log(`[字幕提取] 开始提取轨道索引: ${index} (标签: ${label}) 到 ${outputVttFilename}`)
    try {
      const ffmpegSubArgs = [
        '-i',
        inputFilename,
        '-map',
        `0:s:${index}`, // 使用探测到的索引
        '-c:s',
        'webvtt', // 转换为 VTT
        outputVttFilename
      ]
      await ffmpeg.exec(ffmpegSubArgs)

      const vttDataUint8Array = await ffmpeg.readFile(outputVttFilename)
      console.log(`[字幕提取]   读取 ${outputVttFilename} (${vttDataUint8Array.length} bytes).`)

      const vttBlob = new Blob([vttDataUint8Array], { type: 'text/vtt' })
      const url = URL.createObjectURL(vttBlob)
      console.log(`[字幕提取]   VTT Blob URL 创建: ${url.substring(0, 100)}...`)

      extractedSubtitles.push({
        url: url,
        label: label,
        lang: lang || 'und', // 使用探测到的语言或 'und'
        index: index
      })
    } catch (subError: any) {
      console.warn(`[字幕提取] 提取轨道索引 ${index} 时失败:`, subError.message)
      // 单个轨道提取失败，继续尝试下一个，不中断整个过程
      ElMessage.warning(`提取字幕轨道 ${label} 失败: ${subError.message?.substring(0, 100)}`)
    } finally {
      // 无论成功失败，都尝试清理本次生成的 VTT 文件
      try {
        await ffmpeg.deleteFile(outputVttFilename)
        // console.log(`[字幕提取]   已清理虚拟文件: ${outputVttFilename}`);
      } catch (cleanupError) {
        console.warn(`[字幕提取]   清理 ${outputVttFilename} 时出错:`, cleanupError)
      }
    }
  }

  console.log(`[字幕提取] 完成，共成功提取 ${extractedSubtitles.length} 个轨道。`)
  return extractedSubtitles
}

// --- 移除字幕提取辅助函数 ---
// async function extractAndSetSubtitles(...) { /* ... */ }

// --- MediaSource 事件处理 (通用, 保持不变) ---
function handleSourceClose() {
  console.log('MediaSource 已关闭。')
}
function handleSourceEnded() {
  console.log('MediaSource 已结束。')
}

// --- Video 元素事件处理 ---
function handleVideoError(event: Event) {
  // ... (与之前相同，错误信息可以不用区分 intendedMSEMode) ...
  const video = event.target as HTMLVideoElement
  let errorText = '未知视频错误'
  if (video.error) {
    /* ... (switch case 保持不变) ... */
    if (video.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      if (directPlaybackUrl.value && video.src === directPlaybackUrl.value)
        errorText += ' (MP4 直接播放失败)'
      else if (mseObjectUrl.value && video.src === mseObjectUrl.value)
        errorText += ` (MSE 源设置或 Remux 后格式问题)` // 移除软解判断
    }
  }
  console.error('Video 元素错误:', errorText, video.error)
  errorMessage.value = errorText
  resetPlaybackState()
  showFallbackOptions.value = true
}

function handleVideoCanPlay() {
  console.log('Video can play.')
  if (videoEl.value) {
    const currentSrc = videoEl.value.src

    // 重置所有播放状态标志
    isPlayingDirectly.value = false
    isPlayingWithMSE.value = false
    // isPlayingWithSoftwareMSE.value = false; // 移除

    // 根据当前 src 设置正确的播放状态标志 (现在只有两种可能)
    if (directPlaybackUrl.value && currentSrc === directPlaybackUrl.value) {
      isPlayingDirectly.value = true
      console.log('Direct playback ready.')
    } else if (mseObjectUrl.value && currentSrc === mseObjectUrl.value) {
      isPlayingWithMSE.value = true // 只有 Remux 模式会设置 mseObjectUrl
      console.log('MSE playback ready (Remux).')
    }

    errorMessage.value = null // 清除错误
    showFallbackOptions.value = false // 隐藏回退
  }
}

function handleVideoEnded() {
  console.log('Video ended.')
}

// --- 清理和控制 ---
function closePlayer() {
  resetPlaybackState()
  emit('close')
}

// --- 统一的状态重置函数 ---
function resetPlaybackState() {
  console.log('正在重置播放状态...')
  // 重置标志 (移除软解相关)
  isPlayingWithMSE.value = false
  isPlayingDirectly.value = false
  // isPlayingWithSoftwareMSE.value = false;
  isProcessing.value = false
  isTranscoding.value = false
  // intendedMSEMode.value = null;

  // 重置 video 元素
  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src')
    videoEl.value.load()
    console.log('Video element reset.')
  }

  // 撤销 Object URLs (MSE 和 Direct)
  if (mseObjectUrl.value) {
    URL.revokeObjectURL(mseObjectUrl.value)
    mseObjectUrl.value = null
    console.log('MediaSource Object URL revoked.')
  }
  if (directPlaybackUrl.value) {
    URL.revokeObjectURL(directPlaybackUrl.value)
    directPlaybackUrl.value = null
    console.log('Direct Playback Object URL revoked.')
  }

  // --- 修改点: 撤销所有字幕的 Blob URL ---
  if (subtitlesInfo.value.length > 0) {
    console.log(`准备撤销 ${subtitlesInfo.value.length} 个 VTT Blob URL...`)
    subtitlesInfo.value.forEach((sub) => {
      try {
        URL.revokeObjectURL(sub.url)
        // console.log(`  撤销: ${sub.label} (${sub.url.substring(0,50)}...)`);
      } catch (e) {
        console.warn(`撤销字幕 URL (${sub.label}) 时出错:`, e)
      }
    })
    subtitlesInfo.value = [] // 清空数组
    console.log('所有 VTT Blob URL 已撤销。')
  }

  // 清理 MediaSource 相关资源 (保持不变)
  if (mediaSource.value) {
    /* ... (与之前相同) ... */
    if (mediaSource.value.readyState === 'open') {
      try {
        if (
          sourceBuffer.value &&
          mediaSource.value.sourceBuffers.length > 0 &&
          Array.from(mediaSource.value.sourceBuffers).includes(sourceBuffer.value)
        ) {
          mediaSource.value.removeSourceBuffer(sourceBuffer.value)
        }
        if (mediaSource.value.readyState === 'open') {
          mediaSource.value.endOfStream()
        }
      } catch (e) {
        console.warn('...')
      }
    }
    mediaSource.value = null
    sourceBuffer.value = null
  }

  console.log('Playback state reset complete.')
}

// --- 调用外部播放器 (保持不变) ---
const openSystemPlayer = async (): Promise<void> => {
  // ... (代码与之前相同) ...
  if (!props.videoUrl) {
    ElMessage.error('...')
    return
  }
  if (
    !ConfigStore.PathConfig.playerPath ||
    !window.nodeAPI.fs.existsSync(ConfigStore.PathConfig.playerPath)
  ) {
    ElNotification.error({
      /* ... */
    })
    return
  }
  try {
    await window.electron.ipcRenderer.invoke(
      'open-with-external-player',
      encodeURIComponent(props.videoUrl),
      encodeURIComponent(ConfigStore.PathConfig.playerPath)
    )
    ElNotification.success({
      /* ... */
    })
  } catch (err: any) {
    ElNotification.error({
      /* ... */
    })
  }
}

// --- Vue 生命周期钩子 (保持不变) ---
onMounted(() => {
  if (!props.videoUrl || !props.fileName) {
    errorMessage.value = '...'
    showFallbackOptions.value = true
  } else {
    if (props.fileName.toLowerCase().endsWith('.mp4')) {
      showFallbackOptions.value = false
      tryDirectPlayback()
    } else {
      showFallbackOptions.value = true
      console.log('...')
    }
  }
})

onBeforeUnmount(() => {
  resetPlaybackState() // 清理资源
  if (ffmpegRef.value && ffmpegRef.value.loaded) {
    console.log('...')
    try {
      ffmpegRef.value.terminate()
      console.log('...')
    } catch (e) {
      console.warn('...')
    }
  }
  ffmpegRef.value = null
})

// --- 监听 videoUrl 变化 (保持不变) ---
watch(
  () => props.videoUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl && props.fileName) {
      console.log('...')
      resetPlaybackState()
      errorMessage.value = null
      if (props.fileName.toLowerCase().endsWith('.mp4')) {
        showFallbackOptions.value = false
        tryDirectPlayback()
      } else {
        showFallbackOptions.value = true
        console.log('...')
      }
    } else if (!newUrl) {
      resetPlaybackState()
      errorMessage.value = '...'
      showFallbackOptions.value = true
    }
  }
)
</script>

<style scoped lang="less">
/* 样式基本保持不变 */
.simple-player {
  background-color: #1e1e1e;
  color: #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  max-width: 95vw;
  width: 960px;
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}
.player-header {
  display: flex;
  align-items: center;
  padding: 12px 18px;
  background: #2a2a2a;
  border-bottom: 1px solid #383838;
  flex-shrink: 0;
  h3 {
    margin: 0;
    font-size: 1.05em;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1;
    margin-right: 12px;
    color: #f0f0f0;
  }
  .el-tag {
    margin-left: 8px;
    flex-shrink: 0;
    &[type='info'] {
      --el-tag-bg-color: rgba(144, 147, 153, 0.15);
      --el-tag-border-color: rgba(144, 147, 153, 0.3);
      --el-tag-text-color: #a6a9ad;
    }
    &[type='warning'] {
      --el-tag-bg-color: rgba(230, 162, 60, 0.15);
      --el-tag-border-color: rgba(230, 162, 60, 0.3);
      --el-tag-text-color: #e6a23c;
    }
    &[type='success'] {
      --el-tag-bg-color: rgba(103, 194, 58, 0.15);
      --el-tag-border-color: rgba(103, 194, 58, 0.3);
      --el-tag-text-color: #67c23a;
    }
  }
  .close-btn {
    cursor: pointer;
    font-size: 1.3em;
    color: #999;
    margin-left: 18px;
    flex-shrink: 0;
    transition: color 0.2s ease;
    &:hover {
      color: #eee;
    }
  }
}
.video-container {
  position: relative;
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: black;
  overflow: hidden;
}
.video-element {
  display: block;
  width: 100%;
  height: 100%;
  max-height: calc(90vh - 100px);
  object-fit: contain;
}
.fallback-prompt {
  padding: 16px 24px;
  text-align: center;
  background: #252525;
  border-top: 1px solid #383838;
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
  flex-shrink: 0;
  .el-button {
    margin: 0;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
    }
    .el-icon {
      margin-left: 6px;
    }
  }
}
.el-alert {
  position: absolute;
  bottom: 15px;
  left: 15px;
  right: 15px;
  z-index: 10;
  background-color: rgba(245, 108, 108, 0.8);
  border: 1px solid rgba(245, 108, 108, 0.5);
  color: #fff;
  --el-alert-title-font-size: 14px;
  :deep(.el-alert__title) {
    color: #fff;
    font-weight: bold;
  }
  :deep(.el-alert__icon) {
    color: #fff;
    font-size: 16px;
  }
}
</style>
