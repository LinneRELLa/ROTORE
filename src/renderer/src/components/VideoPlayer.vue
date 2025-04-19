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
import { fetchFile, toBlobURL } from '@ffmpeg/util' // fetchFile 在某些场景可能有用

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
const ffmpegLogs = ref<string[]>([]) // <-- 新增：用于存储 FFmpeg 日志

// --- 状态相关的 Ref ---
const isLoadingFfmpeg = ref(false) // 是否正在加载 FFmpeg
const isProcessing = ref(false) // 是否正在处理视频
const processingProgress = ref(0) // 处理进度
const isPlayingWithMSE = ref(false) // 是否正在使用 MSE 播放
const errorMessage = ref<string | null>(null) // 错误信息
const showFallbackOptions = ref(true) // 初始时显示回退选项

// --- FFmpeg 设置 ---
// FFmpeg 核心文件的基础 URL，建议下载到本地或使用稳定 CDN
// const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm' // 如果通过网络加载时使用

// 加载 FFmpeg 实例
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

    // 修改日志处理程序以存储日志
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg log]', message) // 保留控制台日志（可选）
      ffmpegLogs.value.push(message)      // <-- 存储日志消息
    })

    ffmpeg.on('progress', ({ progress }) => {
      if (isProcessing.value) processingProgress.value = progress * 100
    })

    // --- 从本地文件系统加载 FFmpeg 核心文件 ---
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

    console.log('[渲染进程] 正在读取核心 JS 文件...')
    const coreJsData: Buffer = await window.nodeAPI.fs.readFile(coreJsFullPath)
    console.log(`[渲染进程] 从核心 JS 读取了 ${coreJsData.byteLength} 字节。`)

    console.log('[渲染进程] 正在读取 WASM 文件...')
    const wasmData: Buffer = await window.nodeAPI.fs.readFile(wasmFullPath)
    console.log(`[渲染进程] 从 WASM 读取了 ${wasmData.byteLength} 字节。`)

    console.log('[渲染进程] 正在手动创建 Blob URL...')
    const coreBlob = new Blob([coreJsData], { type: 'text/javascript' })
    const wasmBlob = new Blob([wasmData], { type: 'application/wasm' })

    coreURL = URL.createObjectURL(coreBlob)
    wasmURL = URL.createObjectURL(wasmBlob)
    console.log(
      `[渲染进程] 手动创建的 Blob URLs: Core=${coreURL?.substring(0, 100)}..., Wasm=${wasmURL?.substring(0, 100)}...`
    )

    console.log('[渲染进程] 正在调用 ffmpeg.load() 使用手动创建的 Blob URL...')
    await ffmpeg.load({
      coreURL: coreURL,
      wasmURL: wasmURL
    })

    ffmpegRef.value = ffmpeg
    console.log('[渲染进程] FFmpeg 使用手动创建的 Blob URL 成功加载。')
    return true
  } catch (error: any) {
    console.error('[渲染进程] 使用手动创建的 Blob URL 加载 FFmpeg 失败:', error)
    errorMessage.value = `加载 FFmpeg 核心失败: ${error.message || String(error)}`
    if (String(error.message).includes('431') || String(error).includes('431')) {
       errorMessage.value += ' (仍然遇到 431 错误，可能是开发服务器对大型 Blob URL 请求处理存在问题)'
    }
    return false
  } finally {
    // 撤销手动创建的 Object URL
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

// --- 用于解析日志并构建 Codec 的辅助函数 ---
function parseFfmpegLogsAndGetCodec(logs: string[]): string | null {
  let videoCodec: string | null = null
  let audioCodec: string | null = null
  let videoCodecStr: string | null = null
  let audioCodecStr: string | null = null

  // 正则表达式（简化版，可能需要为更复杂情况优化）
  const streamRegex = /^\s*Stream #\d+:\d+(\(.*\))?:\s*(Video|Audio):\s*(\w+)(.*)/
  // 示例: Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p...
  // 示例: Stream #0:1: Audio: aac (LC), 48000 Hz...

  console.log("--- 开始解析 FFmpeg 日志 ---");
  console.log("捕获到的日志总数:", logs.length);

  for (const log of logs) {
    const match = log.match(streamRegex);
    if (match) {
      const streamType = match[2]; // Video 或 Audio
      const codecName = match[3];  // 例如 h264, aac
      const details = match[4] || ''; // 包含 Profile 等信息的括号部分，例如 (High), (LC)

      console.log(`发现流: 类型=${streamType}, 编码=${codecName}, 详情=${details.trim()}`);

      if (streamType === 'Video' && !videoCodec) { // 取第一个视频流
        videoCodec = codecName.toLowerCase();
        // --- 基础的 Codec 字符串映射 (需要扩展!) ---
        if (videoCodec === 'h264') {
          // 尝试从详情中猜测 Profile，如果不确定则默认为 baseline/main
          if (details.includes('(High)')) {
             videoCodecStr = 'avc1.640028'; // High Profile Level 4.0 (常见猜测)
          } else if (details.includes('(Main)')) {
             videoCodecStr = 'avc1.4D401E'; // Main Profile Level 3.0 (常见猜测)
          } else {
             // 默认猜测 - Baseline，如果需要/可能，调整 level
             videoCodecStr = 'avc1.42E01E'; // Baseline Level 3.0
          }
           console.log(`已映射视频编码 ${videoCodec} 为 ${videoCodecStr}`);
        } else if (videoCodec === 'hevc' || videoCodec === 'h265') {
           // HEVC 映射复杂，通常需要日志中缺失的 level 信息
           // 使用一个常见的占位符 - 需要充分测试！
           videoCodecStr = 'hvc1.1.6.L120.90'; // 示例: Main Profile, Level 4.0, non-real-time
           console.warn(`检测到 HEVC。使用占位 Codec 字符串: ${videoCodecStr}。稳健的 HEVC 支持需要更详细的解析或 ffprobe。`);
        } else if (videoCodec === 'vp9') {
            videoCodecStr = 'vp09.00.50.08'; // VP9 Profile 0, Level 5.0 (常见)
            console.log(`已映射视频编码 ${videoCodec} 为 ${videoCodecStr}`);
        }
        // 在此添加更多视频编码映射 (av1, vp8 等)

      } else if (streamType === 'Audio' && !audioCodec) { // 取第一个音频流
        audioCodec = codecName.toLowerCase();
        // --- 基础的 Codec 字符串映射 ---
        if (audioCodec === 'aac') {
           // 默认为 AAC-LC，如果可能，检查 HE-AAC
           if (details.includes('(HE-AACv2)')) {
               audioCodecStr = 'mp4a.40.29';
           } else if (details.includes('(HE-AAC)')) {
                audioCodecStr = 'mp4a.40.5';
           } else {
               audioCodecStr = 'mp4a.40.2'; // 假设为 AAC-LC
           }
           console.log(`已映射音频编码 ${audioCodec} 为 ${audioCodecStr}`);
        } else if (audioCodec === 'opus') {
           audioCodecStr = 'opus';
           console.log(`已映射音频编码 ${audioCodec} 为 ${audioCodecStr}`);
        } else if (audioCodec === 'mp3') {
            audioCodecStr = 'mp4a.40.34'; // MP4 容器中的 MP3 codec 字符串
             console.log(`已映射音频编码 ${audioCodec} 为 ${audioCodecStr}`);
        }
        // 在此添加更多音频编码映射 (vorbis, ac3 等)
      }
    }
    // 一旦找到视频和音频就停止搜索？(为了以防信息在后面日志中被精炼，暂时解析所有日志)
    // if (videoCodecStr && audioCodecStr) break;
  }
   console.log("--- 完成解析 FFmpeg 日志 ---");

  if (videoCodecStr && audioCodecStr) {
    // 根据编码决定容器类型 - 默认为 mp4，除非特定编码需要 webm
    let container = 'video/mp4';
    if (videoCodec === 'vp9' || videoCodec === 'vp8' || audioCodec === 'vorbis' || audioCodec === 'opus') {
        // 如果涉及 VPx, Vorbis 或 Opus，通常首选/需要 WebM
        // 但 Opus 有时可以在 MP4 中工作。我们这里的 remux 命令默认输出 mp4
        // 暂时基于 remux 命令坚持使用 mp4，但需注意如果 MP4 失败，可考虑此项
        // container = 'video/webm';
    }
    const mime = `${container}; codecs="${videoCodecStr}, ${audioCodecStr}"`;
    console.log(`构建的 mimeCodec: ${mime}`);
    return mime;
  } else {
    console.error('无法从 FFmpeg 日志中确定视频和音频编码。');
    if (!videoCodecStr) console.error("视频编码信息缺失或不支持的映射。");
    if (!audioCodecStr) console.error("音频编码信息缺失或不支持的映射。");
    return null;
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
  ffmpegLogs.value = [] // <-- 开始前清空日志
  isPlayingWithMSE.value = false
  showFallbackOptions.value = false
  errorMessage.value = null
  processingProgress.value = 0

  // 1. 按需加载 FFmpeg
  const ffmpegLoaded = await loadFfmpeg()
  if (!ffmpegLoaded || !ffmpegRef.value) {
    showFallbackOptions.value = true
    return
  }

  // 2. 准备 MediaSource (此处不再检查硬编码的 mimeCodec)
  if (!window.MediaSource) {
      errorMessage.value = `浏览器不支持 MediaSource。`;
      showFallbackOptions.value = true;
      return;
  }

  mediaSource.value = new MediaSource()
  objectUrl.value = URL.createObjectURL(mediaSource.value)
  if (videoEl.value) {
    videoEl.value.src = objectUrl.value
    console.log('视频 src 已设置为 MediaSource Object URL:', objectUrl.value)
  } else {
    errorMessage.value = '视频元素不存在。'
    showFallbackOptions.value = true
    return
  }

  // 添加事件监听器
  mediaSource.value.addEventListener('sourceopen', handleSourceOpen, { once: true })
  mediaSource.value.addEventListener('sourceclose', handleSourceClose)
  mediaSource.value.addEventListener('sourceended', handleSourceEnded)
}

// MediaSource 'sourceopen' 事件处理函数
async function handleSourceOpen() {
  // 检查状态有效性
  if (!mediaSource.value || !ffmpegRef.value || !props.videoUrl) {
    console.error('handleSourceOpen 在无效状态下被调用。')
    resetMSEState() // 如果状态无效则清理
    showFallbackOptions.value = true
    return
  }
  console.log('MediaSource 已打开，准备处理数据。')

  isProcessing.value = true
  processingProgress.value = 0 // 重置进度

  // 清理可能存在的旧 Object URL
  if (objectUrl.value && videoEl.value && videoEl.value.src !== objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    console.warn('在 sourceopen 期间撤销了之前的 Object URL。')
  }

  // 定义文件名
  const inputFileName = `input-${Date.now()}.mkv`
  const outputFileName = `output-${Date.now()}.mp4`
  const vttFileName = `subtitle-${Date.now()}.vtt`

  try {
    // 3. 读取输入文件数据
    console.log(`正在读取文件: ${props.videoUrl}`)
    const inputData: Buffer = await window.nodeAPI.fs.readFile(props.videoUrl)
    const inputUint8Array = new Uint8Array(inputData.buffer, inputData.byteOffset, inputData.byteLength)

    // 4. 将文件写入 FFmpeg VFS
    await ffmpegRef.value.writeFile(inputFileName, inputUint8Array)
    console.log(`已将 ${inputFileName} 写入虚拟文件系统。`)

    // --- FFmpeg Remux 命令 ---
    const ffmpegRemuxArgs = [
       '-i', inputFileName,
       '-map', '0:v:0?', '-map', '0:a:0?', // 映射第一个视频/音频流
       '-c:v', 'copy', '-c:a', 'copy',     // 复制编解码器
       '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // MSE 标志
       '-f', 'mp4',                       // 输出 MP4
       outputFileName
    ]

    // 5. 执行 FFmpeg Remux 命令 (日志处理程序已附加)
    console.log('执行 FFmpeg remux 命令 (将捕获日志用于编解码器检测):', ffmpegRemuxArgs.join(' '))
    await ffmpegRef.value.exec(ffmpegRemuxArgs)
    console.log('FFmpeg remuxing 完成。')

    // 6. 解析日志获取编解码器信息
    const dynamicMimeCodec = parseFfmpegLogsAndGetCodec(ffmpegLogs.value)

    if (!dynamicMimeCodec) {
       // 提供更具体的错误信息
       throw new Error('未能从 FFmpeg 日志中解析出有效的音视频编解码器信息。请检查日志或源文件。');
    }

    // 7. 检查浏览器是否支持解析出的 Codec
     console.log(`检查浏览器是否支持: ${dynamicMimeCodec}`)
    if (!MediaSource.isTypeSupported(dynamicMimeCodec)) {
       throw new Error(`浏览器不支持此视频的编解码器组合: ${dynamicMimeCodec}。请尝试使用外部播放器。`);
    }
    console.log("浏览器支持此编解码器组合。");

    // 8. 添加 SourceBuffer (确保 MediaSource 仍处于 open 状态)
    if (mediaSource.value?.readyState !== 'open') {
       // 可能在长时间处理后 MediaSource 被意外关闭
       throw new Error('尝试添加 SourceBuffer 时，MediaSource 已关闭。');
    }

    console.log(`添加 SourceBuffer，使用 Codec: ${dynamicMimeCodec}`)
    sourceBuffer.value = mediaSource.value.addSourceBuffer(dynamicMimeCodec) // <-- 使用动态 codec
    console.log('SourceBuffer 已添加。')

    // --- 添加 SourceBuffer 事件监听器 ---
    sourceBuffer.value.addEventListener('updateend', () => {
      console.log('SourceBuffer update ended.') // 'updateend' 表示 appendBuffer 操作完成
      // 只有在所有数据都追加完毕后才调用 endOfStream
      // 在这个例子中，我们只追加一次，所以可以在第一次 updateend 后调用
      if (!sourceBuffer.value?.updating && mediaSource.value?.readyState === 'open') {
        console.log('数据追加完毕，调用 endOfStream。')
        try {
          // 在调用前再次检查状态
          if (mediaSource.value.readyState === 'open') {
            mediaSource.value.endOfStream()
             console.log("endOfStream 已调用。");
          } else {
             console.warn("MediaSource 不在 'open' 状态，无法调用 endOfStream。当前状态:", mediaSource.value.readyState);
          }
        } catch (eosError: any) {
          console.error('调用 endOfStream 时出错:', eosError)
           if (eosError.name === 'InvalidStateError') {
             console.warn('尝试在非 open 状态下调用 endOfStream。');
           } else {
             errorMessage.value = `结束媒体流时出错: ${eosError.message}`
             // 根据错误严重性考虑是否重置
             // resetMSEState();
             // showFallbackOptions.value = true;
           }
        }
      }
    })

    sourceBuffer.value.addEventListener('error', (e) => {
      console.error('SourceBuffer 错误事件:', e) // 记录事件对象本身以获取详细信息
      errorMessage.value = 'SourceBuffer 出现错误，可能是数据问题或内部错误。请检查控制台获取详细信息。'
      resetMSEState() // 发生错误时重置
      showFallbackOptions.value = true
    })
    // -------------------------------------

    // 9. 读取重新封装后的数据
    const outputDataUint8Array = await ffmpegRef.value.readFile(outputFileName)
    console.log(`从虚拟文件系统读取 ${outputFileName} (${outputDataUint8Array.length} 字节).`)

    // 10. 追加数据到 SourceBuffer
    // 确保 SourceBuffer 仍然存在且 MediaSource 仍然是 open
    if (sourceBuffer.value && mediaSource.value?.readyState === 'open') {
        // 检查 SourceBuffer 是否正在更新中（理论上此时不应该）
        if (sourceBuffer.value.updating) {
            console.warn("SourceBuffer 正在更新中，等待 'updateend' 后再追加（理论上不应发生在此处）。");
            // 可以设置一个标志位，在 updateend 事件中再尝试追加，但对于单次追加可能过度复杂
        } else {
            console.log('准备追加数据到 SourceBuffer...')
            sourceBuffer.value.appendBuffer(outputDataUint8Array.buffer) // 传递 ArrayBuffer
            console.log('appendBuffer 已调用。等待 "updateend" 事件...')
        }
    } else {
        let reason = '';
        if (!sourceBuffer.value) reason += 'SourceBuffer 不存在。';
        if (mediaSource.value?.readyState !== 'open') reason += ` MediaSource 状态为 ${mediaSource.value?.readyState} 而不是 open。`;
        throw new Error(`无法追加数据：${reason.trim()}`)
    }


    // 11. 提取字幕 (可以放在 appendBuffer 调用之后，因为它独立运行)
    try {
        const ffmpegSubArgs = [
           '-i', inputFileName,
           '-map', '0:s:0?', // 映射第一个字幕流
           '-c:s', 'webvtt', // 转换为 VTT 格式
           vttFileName
       ]
        console.log('执行 FFmpeg 字幕提取命令:', ffmpegSubArgs.join(' '))
        await ffmpegRef.value.exec(ffmpegSubArgs)

        const vttDataUint8Array = await ffmpegRef.value.readFile(vttFileName)
        console.log(`从虚拟文件系统读取 ${vttFileName} (${vttDataUint8Array.length} 字节).`)

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
            try { // 为设置模式添加 try-catch
               // 尝试将第一个字幕轨道的模式设置为 'showing'
               videoEl.value.textTracks[0].mode = 'showing'
               console.log('尝试默认启用字幕轨道。')
            } catch (trackError) {
               console.warn("设置字幕轨道模式时出错:", trackError);
            }
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

    // 12. 清理虚拟文件系统 (良好实践)
    try {
        await ffmpegRef.value.deleteFile(inputFileName)
        await ffmpegRef.value.deleteFile(outputFileName)
        // 确保也删除 VTT 文件（即使提取失败也尝试删除）
        try { await ffmpegRef.value.deleteFile(vttFileName); } catch { /* ignore delete error */ }
        console.log('虚拟文件系统清理完毕。')
    } catch(cleanupError) {
        console.warn("清理虚拟文件系统时出错:", cleanupError);
    }


    isPlayingWithMSE.value = true // 标记 MSE 播放已准备就绪 (实际播放由 video 元素自动开始或用户控制)

  } catch (error: any) {
    console.error('MSE 处理流程中捕获到错误:', error) // 使用更明确的日志
    errorMessage.value = `处理失败: ${error.message || '未知错误'}` // 确保有错误消息
    resetMSEState() // 发生任何阻止播放的错误时清理状态
    showFallbackOptions.value = true // 允许用户选择其他方式
  } finally {
    isProcessing.value = false
    processingProgress.value = 0
  }
}

// MediaSource 'sourceclose' 事件处理函数
function handleSourceClose() {
  console.log('MediaSource 已关闭。')
  // 可以在这里处理非预期的关闭情况，例如检查是否仍在播放中
}
// MediaSource 'sourceended' 事件处理函数
function handleSourceEnded() {
  console.log('MediaSource 已结束 (endOfStream 调用成功)。')
}

// Video 元素 'error' 事件处理函数
function handleVideoError(event: Event) {
  const video = event.target as HTMLVideoElement
  let errorText = '未知视频错误'
  if (video.error) {
    console.error('HTMLVideoElement 错误对象:', video.error); // 打印详细错误对象
    switch (video.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorText = '视频加载被中止。'
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorText = '网络错误导致视频加载失败。'
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorText = '视频解码错误 - 文件可能已损坏或编码不受支持（即使在 MSE 中）。'
        // 这通常是编解码器不兼容或数据损坏的体现
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        // 对于 MSE，这通常意味着 MediaSource 设置或 SourceBuffer 添加时就有问题，
        // 或者浏览器无法处理通过 MSE 提供的流格式。
        errorText = '视频源格式不支持（MediaSource/SourceBuffer 问题？）。'
        break
      default:
        errorText = `发生未知视频错误 (Code: ${video.error.code})。`
    }
  }
  console.error('Video 元素错误:', errorText)
  errorMessage.value = errorText
  resetMSEState() // 发生视频错误时清理状态
  showFallbackOptions.value = true // 允许用户选择其他方式
}

// 关闭播放器并清理资源
function closePlayer() {
  console.log("请求关闭播放器...");
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
    videoEl.value.load() // 请求浏览器重置 video 元素状态
    console.log('Video 元素已重置。')
  }

  // 释放 Object URLs
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    console.log('MediaSource Object URL 已撤销:', objectUrl.value)
    objectUrl.value = null
  }
  if (vttBlobUrl.value) {
    URL.revokeObjectURL(vttBlobUrl.value)
     console.log('VTT Blob URL 已撤销:', vttBlobUrl.value)
    vttBlobUrl.value = null
    subtitleUrl.value = null // 同时清除响应式 ref
  }

  // 关闭 MediaSource (如果处于打开状态)
  // 注意：在移除 SourceBuffer 前调用 endOfStream 或在非 open 状态调用可能出错
  if (mediaSource.value && mediaSource.value.readyState === 'open') {
    console.log('尝试关闭 MediaSource...')
    try {
      // 尝试在结束流之前移除 SourceBuffer (可能比较复杂且易出错, 谨慎操作)
      // 检查 SourceBuffers 是否还存在
      const buffers = mediaSource.value.sourceBuffers;
      if (buffers && buffers.length > 0) {
          // 迭代移除所有 SourceBuffer
          // Note: Modifying SourceBufferList while iterating might be problematic. Convert to array first.
          const buffersArray = Array.from(buffers);
          console.log(`尝试移除 ${buffersArray.length} 个 SourceBuffer...`);
          for (const buffer of buffersArray) {
              // 检查 buffer 是否还在 MediaSource 的列表中
              if (Array.from(mediaSource.value.sourceBuffers).includes(buffer)) {
                 try {
                     mediaSource.value.removeSourceBuffer(buffer);
                     console.log("一个 SourceBuffer 已移除。");
                 } catch (removeError) {
                      console.warn("移除 SourceBuffer 时出错:", removeError);
                 }
              }
          }
      }

      // 再次检查状态，确保在 open 状态下结束流
      if (mediaSource.value.readyState === 'open') {
        console.log('结束 MediaSource 流...')
        mediaSource.value.endOfStream()
      } else {
          console.log(`移除 SourceBuffer 后，MediaSource 状态变为: ${mediaSource.value.readyState}，不再调用 endOfStream。`);
      }

    } catch (e) {
      console.warn('在重置期间移除 SourceBuffer 或结束流时出错:', e)
    }
  } else if (mediaSource.value) {
    console.log(`MediaSource 已处于状态: ${mediaSource.value.readyState}，无需关闭。`)
  }

  // 清理引用
  mediaSource.value = null
  sourceBuffer.value = null // 确保引用被清除

  // 不在此处终止 ffmpeg 实例，应在组件卸载时进行
  // 如果因错误重置，可能需要保留错误信息，所以不清空 errorMessage
  console.log('MSE 状态重置完成。')
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
    // 对文件路径和播放器路径进行编码通常更安全，但 IPC 调用可能不需要
    await window.electron.ipcRenderer.invoke(
      'open-with-external-player',
      props.videoUrl, // 传递原始路径给主进程处理可能更安全
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
  console.log("组件即将卸载，执行清理...");
  resetMSEState() // 清理 MSE 相关资源
  // 终止 FFmpeg 实例 (如果存在且已加载)
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
      console.log('视频 URL 已更改，重置播放器状态。')
      resetMSEState()
      errorMessage.value = null // 清除旧错误
      showFallbackOptions.value = true // 为新视频显示回退选项
      ffmpegLogs.value = []; // 清空旧日志
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