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
        >加载解码器核心...</el-tag
      >
      <el-tag
        v-if="isProcessingSubs || isDiscoveringSubtitles"
        type="warning"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >{{ isDiscoveringSubtitles ? '扫描字幕 (WASM)...' : '提取字幕 (WASM)...' }}</el-tag
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
        :closable="true"
        @close="errorMessage = null"
      />
    </div>

    <div class="controls-section subtitle-selection">
      <el-select
        v-model="selectedSubtitleIndex"
        placeholder="选择字幕轨道"
        size="small"
        :disabled="
          isLoadingFfmpeg ||
          isDiscoveringSubtitles ||
          isProcessingSubs ||
          availableSubtitles.length === 0 ||
          VedioError
        "
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
  </div>
</template>

<script setup lang="ts">
import { ElNotification, ElMessage } from 'element-plus'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useFile } from '@renderer/hooks/useFile'
import { FFmpeg } from '@ffmpeg/ffmpeg'
// import { fetchFile } from '@ffmpeg/util'; // 如果直接读取文件内容，这个可能不是必需的

const { ConfigStore } = useFile()

interface SubtitleTrack {
  index: number
  language?: string
  codec?: string
  label: string
}

const props = defineProps({
  videoUrl: String,
  fileName: String
})
const emit = defineEmits(['close'])

const videoEl = ref<HTMLVideoElement>()
const ffmpegRef = ref<FFmpeg | null>(null)
const subtitleUrl = ref<string | null>(null)
const vttBlobUrl = ref<string | null>(null) // 用于显示字幕的 Blob URL
const coreBlobURLs = ref<{ coreURL?: string; wasmURL?: string; workerURL?: string }>({}) // 存储 FFmpeg 核心文件的 Blob URL

const isLoadingFfmpeg = ref(false)
const isDiscoveringSubtitles = ref(false)
const isProcessingSubs = ref(false)
const errorMessage = ref<string | null>(null)
const showFallbackOptions = ref(false)
const VedioError = ref(false)

const availableSubtitles = ref<SubtitleTrack[]>([])
const selectedSubtitleIndex = ref<number | null | string>(-1)
const ffmpegLogOutput = ref<string[]>([])

async function loadWasmFfmpeg(): Promise<FFmpeg | null> {
  if (ffmpegRef.value?.loaded) {
    console.log('ffmpeg.wasm 已经加载。')
    return ffmpegRef.value
  }
  isLoadingFfmpeg.value = true
  ffmpegLogOutput.value = []
  errorMessage.value = null
  console.log('开始加载 ffmpeg.wasm 核心 (通过读取文件创建 Blob URL)...')

  // 清理之前可能存在的旧 Blob URL
  if (coreBlobURLs.value.coreURL) URL.revokeObjectURL(coreBlobURLs.value.coreURL)
  if (coreBlobURLs.value.wasmURL) URL.revokeObjectURL(coreBlobURLs.value.wasmURL)
  if (coreBlobURLs.value.workerURL) URL.revokeObjectURL(coreBlobURLs.value.workerURL)
  coreBlobURLs.value = {}

  try {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => {
      ffmpegLogOutput.value.push(message)
      // console.log('[FFMPEG-WASM LOG]:', message);
    })

    const ipcRenderer = window.electron.ipcRenderer
    const FFPath = await ipcRenderer.invoke('getFFPath') // 主进程返回 ffmpeg-core.js 等文件所在的目录
    if (!FFPath || typeof FFPath !== 'string') {
      throw new Error('无法从主进程获取有效的 FFmpeg Core 基础路径 (getFFPath)。')
    }
    console.log(`[WASM] FFmpeg Core 基础目录 (来自主进程): ${FFPath}`)

    if (!window.nodeAPI?.path?.join || !window.nodeAPI?.fs?.readFile) {
      throw new Error('预加载脚本未正确暴露 nodeAPI.path.join 或 nodeAPI.fs.readFile。')
    }

    const coreJsFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.js')
    const wasmFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.wasm')
    // const workerFullPath = window.nodeAPI.path.join(FFPath, 'ffmpeg-core.worker.js'); // 多线程版本

    console.log(`[WASM] 读取 JS Core: ${coreJsFullPath}`)
    const coreJsData: Buffer = await window.nodeAPI.fs.readFile(coreJsFullPath)
    console.log(`[WASM] 读取 WASM Core: ${wasmFullPath}`)
    const wasmData: Buffer = await window.nodeAPI.fs.readFile(wasmFullPath)
    // let workerData: Buffer | undefined;
    // try {
    //   workerData = await window.nodeAPI.fs.readFile(workerFullPath);
    // } catch (e) { console.warn(`[WASM] Worker JS 文件 (${workerFullPath}) 可能不存在或读取失败。`); }

    const coreBlob = new Blob([coreJsData], { type: 'text/javascript' })
    const wasmBlob = new Blob([wasmData], { type: 'application/wasm' })
    // const workerBlob = workerData ? new Blob([workerData], { type: 'text/javascript' }) : undefined;

    coreBlobURLs.value.coreURL = URL.createObjectURL(coreBlob)
    coreBlobURLs.value.wasmURL = URL.createObjectURL(wasmBlob)
    // if (workerBlob) coreBlobURLs.value.workerURL = URL.createObjectURL(workerBlob);

    console.log(`[WASM] Core JS Blob URL: ${coreBlobURLs.value.coreURL}`)
    console.log(`[WASM] Core WASM Blob URL: ${coreBlobURLs.value.wasmURL}`)
    // if (coreBlobURLs.value.workerURL) console.log(`[WASM] Core Worker Blob URL: ${coreBlobURLs.value.workerURL}`);

    await ffmpeg.load({
      coreURL: coreBlobURLs.value.coreURL,
      wasmURL: coreBlobURLs.value.wasmURL
      // workerURL: coreBlobURLs.value.workerURL,
    })

    ffmpegRef.value = ffmpeg
    console.log('ffmpeg.wasm 核心通过 Blob URL 加载成功。')
    ElNotification.success({ title: 'FFmpeg WASM', message: '解码器核心加载成功!' })
    return ffmpeg
  } catch (error: any) {
    console.error('加载 ffmpeg.wasm (Blob URL) 失败:', error)
    errorMessage.value = `加载解码器核心失败: ${error.message || String(error)}`
    ElNotification.error({ title: '解码器错误', message: `加载失败: ${error.message}` })
    // 出错时也清理 Blob URL
    if (coreBlobURLs.value.coreURL) URL.revokeObjectURL(coreBlobURLs.value.coreURL)
    if (coreBlobURLs.value.wasmURL) URL.revokeObjectURL(coreBlobURLs.value.wasmURL)
    if (coreBlobURLs.value.workerURL) URL.revokeObjectURL(coreBlobURLs.value.workerURL)
    coreBlobURLs.value = {}
    return null
  } finally {
    isLoadingFfmpeg.value = false
    // 注意：Blob URL 不能在此处释放，ffmpeg 实例在运行时可能还需要它们。
    // 我们将在 onBeforeUnmount 中释放。
  }
}

async function getVideoFileObjectFromPath(
  filePath: string,
  fileNameFromProp?: string
): Promise<File | null> {
  if (!filePath) return null
  console.log(`[WASM] 准备从路径获取视频 File 对象: ${filePath}`)
  try {
    const result = await window.electron.ipcRenderer.invoke('read-file-content', filePath)
    if (result && result.data instanceof Uint8Array && result.name) {
      const actualFileName = fileNameFromProp || result.name
      // 尝试从文件名推断 MIME 类型，或使用通用类型
      let mimeType = 'application/octet-stream'
      const ext = actualFileName.split('.').pop()?.toLowerCase()
      if (ext === 'mp4') mimeType = 'video/mp4'
      else if (ext === 'mkv') mimeType = 'video/x-matroska'
      else if (ext === 'webm') mimeType = 'video/webm'
      else if (ext === 'avi') mimeType = 'video/x-msvideo'

      const file = new File([result.data.buffer], actualFileName, { type: mimeType })
      console.log(
        `[WASM] 成功创建视频 File 对象: ${file.name}, 类型: ${file.type}, 大小: ${file.size}`
      )
      return file
    }
    errorMessage.value = '从主进程读取视频文件内容失败或返回数据格式不正确。'
    console.warn('从主进程读取视频文件内容失败或返回数据格式不正确。', result)
    return null
  } catch (error: any) {
    console.error('[WASM] 从路径创建视频 File 对象时出错:', error)
    errorMessage.value = `读取视频文件失败: ${error.message || String(error)}`
    return null
  }
}

async function discoverSubtitleTracksWasm(videoFile: File) {
  const ffmpeg = ffmpegRef.value
  if (!ffmpeg || !ffmpeg.loaded) {
    ElNotification.warning({ title: 'FFmpeg 未就绪', message: 'ffmpeg.wasm 尚未加载。' })
    return
  }
  if (isDiscoveringSubtitles.value) return

  isDiscoveringSubtitles.value = true
  availableSubtitles.value = []
  selectedSubtitleIndex.value = -1 // 重置
  errorMessage.value = null
  console.log(`[WASM] 使用 WORKERFS 扫描字幕轨道: ${videoFile.name}`)

  const mountPoint = '/input_video_scan'
  const ffmpegInputFilename = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_') // 清理文件名以用作 VFS 路径

  try {
    ffmpegLogOutput.value = [] // 清空日志，为本次操作做准备
    // 挂载 WORKERFS
    try {
      // console.log(`[WASM] Attempting to unmount ${mountPoint} if it exists...`);
      // await ffmpeg.unmount(mountPoint); // 尝试卸载，如果之前操作意外未卸载
    } catch (e) {
      /* 可能目录不存在，忽略 */
    }
    try {
      await ffmpeg.createDir(mountPoint)
    } catch (e) {
      /* 目录可能已存在，忽略 */ console.warn(`创建目录 ${mountPoint} 失败 (可能已存在): ${e}`)
    }

    await ffmpeg.mount('WORKERFS', { files: [videoFile] }, mountPoint)
    console.log(
      `[WASM] 视频文件 ${videoFile.name} 已通过 WORKERFS 挂载到 ${mountPoint}/${ffmpegInputFilename}`
    )

    // 执行 ffmpeg 命令 (仅探测信息)
    // 使用 -v verbose 获取更详细的流信息，但注意日志量可能很大
    // '-f', 'null', '-' 是告诉 ffmpeg 不要产生实际输出文件
    try {
      await ffmpeg.exec([
        '-hide_banner',
        '-i',
        `${mountPoint}/${videoFile.name}`,
        '-t',
        '0.1',
        '-f',
        'null',
        '-'
      ])
    } catch (error) {
      console.log(error)
    }

    console.log('[WASM] FFmpeg 执行完成，开始解析日志...',ffmpegLogOutput.value)
    // FFmpeg 对于没有输出文件的操作，如果成功解析输入但没有做任何转换，可能会以非0代码退出，这通常是正常的。
    // 我们主要依赖日志输出来获取信息。

    const subs: SubtitleTrack[] = []
    let subtitleMapIndex = 0
    // 正则表达式尝试匹配: Stream #0:INDEX(LANG): Subtitle: CODEC_NAME other_stuff
    const streamRegex = /Stream #\d+:(\d+)(?:\((\w{3})\))?:\s+Subtitle:\s+([\w-]+)/g
    console.log('[WASM] 开始解析 FFmpeg 日志以查找字幕流...')

    for (const logLine of ffmpegLogOutput.value) {
      let match
      while ((match = streamRegex.exec(logLine)) !== null) {
        // match[1] 是 FFmpeg 内部流的绝对索引，我们用自己的 subtitleMapIndex 作为字幕流的相对索引
        const language = match[2] || 'und'
        const codec = match[3]
        const label = `轨道 ${subtitleMapIndex} ${language !== 'und' ? `(${language})` : ''} (${codec})`
        subs.push({ index: subtitleMapIndex, language, codec, label })
        console.log(`[WASM] 发现字幕: Index=${subtitleMapIndex}, Lang=${language}, Codec=${codec}`)
        subtitleMapIndex++
      }
    }
    availableSubtitles.value = subs
    if (subs.length === 0)
      ElNotification.info({
        title: '无内嵌字幕',
        message: '视频文件中未扫描到内嵌字幕轨道 (WASM)。'
      })
    selectedSubtitleIndex.value = -1 // 默认无字幕
  } catch (error: any) {
    console.error('[WASM] WORKERFS 扫描字幕失败:', error, error.stack)
    console.error('[WASM] FFmpeg 日志:\n', ffmpegLogOutput.value.join('\n'))
    ElNotification.error({
      title: '扫描错误',
      message: `扫描字幕失败 (WASM): ${error.message || '未知错误'}`
    })
  } finally {
    isDiscoveringSubtitles.value = false
    try {
      if (ffmpeg && ffmpeg.loaded) {
        // 再次检查 ffmpeg 实例状态
        await ffmpeg.unmount(mountPoint)
        console.log(`[WASM] 已卸载 WORKERFS 挂载点 ${mountPoint} (扫描)`)
      }
    } catch (e) {
      console.warn(`[WASM] 卸载 ${mountPoint} 出错 (扫描):`, e)
    }
  }
}

async function extractAndSetSubtitlesWasm(videoFile: File, subtitleTrackIndex: number) {
  const ffmpeg = ffmpegRef.value
  if (!ffmpeg || !ffmpeg.loaded) {
    ElNotification.warning({ title: 'FFmpeg 未就绪', message: 'ffmpeg.wasm 尚未加载。' })
    return
  }
  if (isProcessingSubs.value) return

  isProcessingSubs.value = true
  errorMessage.value = null
  await clearSubtitleTrack() // 清理旧字幕 Blob URL

  const mountPoint = '/input_video_extract'
  const ffmpegInputFilename = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const outputVttFilename = `subtitle_extract_${Date.now()}.vtt` // 输出到 WASM 的 MEMFS

  console.log(`[WASM] 使用 WORKERFS 提取字幕轨道索引 ${subtitleTrackIndex} 从 ${videoFile.name}`)

  try {
    ffmpegLogOutput.value = [] // 清空日志
    try {
      // await ffmpeg.unmount(mountPoint);
    } catch (e) {
      /* ignore */
    }
    try {
      await ffmpeg.createDir(mountPoint)
    } catch (e) {
      /* ignore */
    }

    await ffmpeg.mount('WORKERFS', { files: [videoFile] }, mountPoint)
    console.log(
      `[WASM] 视频文件 ${videoFile.name} 已通过 WORKERFS 挂载到 ${mountPoint}/${ffmpegInputFilename} (提取)`
    )

    const execArgs = [
      '-hide_banner',
      '-i',
      `${mountPoint}/${videoFile.name}`,
      '-map',
      `0:s:${subtitleTrackIndex}`,
      '-c:s',
      'webvtt',
      outputVttFilename
    ]
    console.log('[WASM] FFmpeg 提取参数:', execArgs.join(' '))
    // try {
   
    // } catch (error) {
    //   console.log('error', error)
    // }
    await ffmpeg.exec(execArgs)
    console.log('[WASM] 字幕提取命令执行完成。')

    const vttDataUint8Array = (await ffmpeg.readFile(outputVttFilename)) as Uint8Array

    if (vttDataUint8Array?.length > 0) {
      const vttBlob = new Blob([vttDataUint8Array.buffer], { type: 'text/vtt' }) // 使用 .buffer
      const newVttBlobUrl = URL.createObjectURL(vttBlob)

      if (vttBlobUrl.value) URL.revokeObjectURL(vttBlobUrl.value)
      vttBlobUrl.value = newVttBlobUrl
      subtitleUrl.value = newVttBlobUrl

      console.log('[WASM] VTT 字幕 Blob URL 已创建:', subtitleUrl.value)
      await nextTick()
      enableSubtitleTrack()
    } else {
      throw new Error('提取的 VTT 文件为空或读取失败。')
    }
    await ffmpeg.deleteFile(outputVttFilename) // 从 MEMFS 删除
    console.log(`[WASM] 已从 MEMFS 删除 ${outputVttFilename}`)
  } catch (error: any) {
    console.error(`[WASM] WORKERFS 提取字幕轨道 ${subtitleTrackIndex} 失败:`, error)
    console.error('[WASM] FFmpeg 日志:\n', ffmpegLogOutput.value.join('\n'))
    ElNotification.error({
      title: '提取失败',
      message: `无法提取字幕 (WASM): ${error.message || String(error)}`
    })
    await clearSubtitleTrack()
  } finally {
    isProcessingSubs.value = false
    try {
      if (ffmpeg && ffmpeg.loaded) {
        await ffmpeg.unmount(mountPoint)
        console.log(`[WASM] 已卸载 WORKERFS 挂载点 ${mountPoint} (提取)`)
      }
    } catch (e) {
      console.warn(`[WASM] 卸载 ${mountPoint} 出错 (提取):`, e)
    }
  }
}

async function clearSubtitleTrack() {
  if (vttBlobUrl.value) {
    URL.revokeObjectURL(vttBlobUrl.value)
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
      console.warn('禁用字幕轨道时出错:', e)
    }
  }
}

async function enableSubtitleTrack() {
  await nextTick()
  if (videoEl.value?.textTracks && videoEl.value.textTracks.length > 0) {
    let trackSet = false
    for (let i = videoEl.value.textTracks.length - 1; i >= 0; i--) {
      const track = videoEl.value.textTracks[i]
      if (!track || track.mode === undefined) continue
      if (track.kind === 'subtitles') {
        try {
          const trackElements = videoEl.value.querySelectorAll('track')
          const correspondingElement = Array.from(trackElements).find((el) => el.track === track)
          if (
            correspondingElement?.src &&
            correspondingElement.readyState !== HTMLTrackElement.NONE
          ) {
            track.mode = 'showing'
            if (track.mode === 'showing') {
              console.log(`字幕轨道 ${i} 已成功启用。`)
              trackSet = true
            } else {
              console.warn(
                `尝试设置轨道 ${i} mode 为 'showing' 后，读取到的 mode 仍然是 ${track.mode}`
              )
            }
            break // 只启用找到的第一个有效字幕轨道
          } else {
            console.warn(`字幕轨道 ${i} 对应的 <track> 元素无效或未加载，跳过启用。`)
          }
        } catch (trackError) {
          console.error(`设置字幕轨道 ${i} 模式时出错:`, trackError)
        }
      } else if (track.mode !== 'disabled') {
        track.mode = 'disabled'
      }
    }
    if (!trackSet) console.warn('未能找到或成功启用目标字幕轨道。')
  } else {
    console.warn('视频 TextTracks 不可用或为空，无法自动启用字幕。')
  }
}

async function handleSubtitleSelection(selectedIndexValue: number | null | string) {
  const index =
    typeof selectedIndexValue === 'string' ? parseInt(selectedIndexValue, 10) : selectedIndexValue
  if (index === null || isNaN(index)) {
    console.warn('无效的字幕索引选择:', selectedIndexValue)
    return
  }
  selectedSubtitleIndex.value = index
  await clearSubtitleTrack()

  if (index >= 0 && props.videoUrl) {
    const videoFileForWasm = await getVideoFileObjectFromPath(props.videoUrl, props.fileName)
    if (videoFileForWasm && ffmpegRef.value?.loaded) {
      await extractAndSetSubtitlesWasm(videoFileForWasm, index)
    } else {
      ElMessage.warning('视频文件未准备好或 FFmpeg WASM 未加载。')
      if (!ffmpegRef.value?.loaded) console.log('FFmpeg 实例未加载')
      if (!videoFileForWasm) console.log('Video File 对象未能创建')
    }
  }
}

async function initializePlayer(videoPath: string) {
  console.log('初始化播放器设置...')
  VedioError.value = false
  await resetPlayerState() // 使用 await
  errorMessage.value = null
  showFallbackOptions.value = false

  if (!videoEl.value) {
    errorMessage.value = '视频播放器元素尚未准备好。'
    return
  }

  try {
    videoEl.value.src = videoPath
    videoEl.value.oncanplay = () => console.log('视频已准备好播放 (canplay 事件)。')

    const ffmpegInstance = await loadWasmFfmpeg()
    if (ffmpegInstance) {
      const videoFileForWasm = await getVideoFileObjectFromPath(videoPath, props.fileName)
      if (videoFileForWasm) {
        discoverSubtitleTracksWasm(videoFileForWasm).catch((err) => {
          console.error('[WASM] 后台扫描字幕时发生未捕获错误:', err)
          // UI提示已在 discoverSubtitleTracksWasm 内部处理
        })
      } else {
        ElNotification.warning({
          title: '视频处理问题',
          message: '无法处理视频文件以扫描字幕 (WASM)。'
        })
      }
    } else {
      // errorMessage.value 已经在 loadWasmFfmpeg 中设置
    }
  } catch (error: any) {
    console.error('初始化播放器时出错:', error)
    errorMessage.value = `无法加载视频或 FFmpeg: ${error.message}`
    showFallbackOptions.value = true
  }
}

function handleVideoError(event: Event) {
  const video = event.target as HTMLVideoElement
  let errorText = '未知视频错误'
  if (video.error) {
    VedioError.value = true
    switch (video.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorText = '视频加载被用户中止。'
        break
      case MediaError.MEDIA_ERR_NETWORK:
        errorText = '网络错误导致视频加载失败。'
        break
      case MediaError.MEDIA_ERR_DECODE:
        errorText = '视频解码错误。'
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorText = '视频源格式不支持。'
        break
      default:
        errorText = `未知视频错误 (Code: ${video.error.code})。`
    }
  }
  console.error('Video 元素错误:', errorText, video.error)
  errorMessage.value = errorText
  showFallbackOptions.value = true
}

async function closePlayer() {
  console.log('请求关闭播放器...')
  await resetPlayerState() // 使用 await
  emit('close')
}

async function resetPlayerState() {
  console.log('正在重置播放器状态...')
  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src')
    videoEl.value.load()
    videoEl.value.oncanplay = null
  }
  await clearSubtitleTrack()
  availableSubtitles.value = []
  selectedSubtitleIndex.value = -1 // 重置为无字幕
  errorMessage.value = null
  isProcessingSubs.value = false
  isDiscoveringSubtitles.value = false
  VedioError.value = false
  // isLoadingFfmpeg 由 loadWasmFfmpeg 内部管理
  // ffmpegLogOutput.value = []; // 可选：清空日志
  console.log('播放器状态重置完成。')
}

const openSystemPlayer = async (): Promise<void> => {
  if (!props.videoUrl) {
    ElMessage.error('视频路径无效')
    return
  }
  if (
    !ConfigStore.PathConfig.playerPath ||
    !window.nodeAPI.fs.existsSync(ConfigStore.PathConfig.playerPath)
  ) {
    ElNotification.error({ title: '播放失败', message: '外部播放器路径无效。', duration: 3000 })
    return
  }
  try {
    await window.electron.ipcRenderer.invoke(
      'open-with-external-player',
      props.videoUrl,
      ConfigStore.PathConfig.playerPath
    )
  } catch (err: any) {
    ElNotification.error({ title: '播放失败', message: err.message || String(err), duration: 3000 })
  }
}

onMounted(async () => {
  if (props.videoUrl) {
    await initializePlayer(props.videoUrl)
  } else {
    errorMessage.value = '未提供视频文件路径。'
    showFallbackOptions.value = true
  }
})

onBeforeUnmount(async () => {
  console.log('[WASM] 组件即将卸载，执行最终清理...')
  await resetPlayerState()
  if (ffmpegRef.value?.loaded) {
    try {
      await ffmpegRef.value.terminate()
      ffmpegRef.value = null
      console.log('[WASM] ffmpeg.wasm 实例已终止。')
    } catch (e) {
      console.error('[WASM] 终止 ffmpeg.wasm 实例时出错:', e)
    }
  }
  // 释放 FFmpeg Core 的 Blob URL
  if (coreBlobURLs.value.coreURL) URL.revokeObjectURL(coreBlobURLs.value.coreURL)
  if (coreBlobURLs.value.wasmURL) URL.revokeObjectURL(coreBlobURLs.value.wasmURL)
  if (coreBlobURLs.value.workerURL) URL.revokeObjectURL(coreBlobURLs.value.workerURL)
  coreBlobURLs.value = {}
  console.log('[WASM] FFmpeg Core Blob URL 已释放。')
})

watch(
  () => props.videoUrl,
  async (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      await initializePlayer(newUrl)
    } else if (!newUrl && oldUrl) {
      await resetPlayerState()
      errorMessage.value = '视频文件路径已移除。'
    }
  }
)
</script>
<style scoped lang="less">
/* 样式保持不变 */
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
.simple-player {
  background-color: #222;
  color: #eee;
  border-radius: 8px;
  overflow: hidden;
  max-width: 90vw;
  width: 800px;
  display: flex;
  flex-direction: column;
  height: 600px;
  max-height: 85vh;
}
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
.video-container {
  position: relative;
  flex-grow: 1;
  background: black;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}
.video-element {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
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
.el-alert {
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  z-index: 10;
  border-radius: 4px;
}
</style>
