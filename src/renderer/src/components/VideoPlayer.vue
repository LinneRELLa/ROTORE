<template>
  <div class="simple-player">
    <div class="player-header">
      <h3>{{ fileName }}</h3>
      <el-tag
        v-if="isCheckingFFmpeg"
        type="warning"
        effect="light"
        size="small"
        style="margin-left: 10px"
        >检查 FFmpeg...</el-tag
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
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="true" />
    </div>

    <div class="controls-section subtitle-selection">
      <el-select
        v-model="selectedSubtitleIndex"
        placeholder="选择字幕轨道"
        size="small"
        :disabled="
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
// 移除 import { FFmpeg } from '@ffmpeg/ffmpeg'

const { ConfigStore } = useFile()

// --- 接口定义 (保持不变) ---
interface SubtitleTrack {
  index: number // 这个 index 对应 FFmpeg 命令行中的字幕流索引 (e.g., 0, 1, 2...)
  language?: string
  codec?: string
  label: string // UI 显示的标签
}

// --- Props 和 Emits (保持不变) ---
const props = defineProps({
  videoUrl: String, // 假设这个 URL 是本地文件系统的绝对路径
  fileName: String
})
const emit = defineEmits(['close'])

// --- Refs (移除 ffmpegRef, 新增 ffmpegExePath 和 tempVttFilePath) ---
const videoEl = ref<HTMLVideoElement>()
const subtitleUrl = ref<string | null>(null)
const vttBlobUrl = ref<string | null>(null) // 存储 Blob URL 用于撤销
const ffmpegExePath = ref<string | null>(null) // 存储 ffmpeg.exe 的完整路径
const tempVttFilePath = ref<string | null>(null) // 存储主进程生成的临时 VTT 文件路径，用于后续清理

// --- 状态 Refs (修改 isLoadingFfmpeg 为 isCheckingFFmpeg) ---
const isCheckingFFmpeg = ref(false) // 重命名状态
const isDiscoveringSubtitles = ref(false)
const isProcessingSubs = ref(false)
const errorMessage = ref<string | null>(null)
const showFallbackOptions = ref(false)
const VedioError = ref(false)

// --- 字幕相关状态 Refs (保持不变) ---
const availableSubtitles = ref<SubtitleTrack[]>([])
const selectedSubtitleIndex = ref<number | null | string>(-1) // 初始设为 -1 (无字幕)

// --- 移除 ffmpegLogs ref ---

// --- FFmpeg 检查逻辑 (重写 loadFfmpeg) ---
async function checkNativeFFmpeg(): Promise<boolean> {
  if (ffmpegExePath.value) {
    console.log('FFmpeg 路径已确认:', ffmpegExePath.value)
    return true
  }

  isCheckingFFmpeg.value = true
  errorMessage.value = null

  try {
    // --- 获取 FFmpeg 基础路径 ---
    const ipcRenderer = window.electron.ipcRenderer
    const FFPath = await ipcRenderer.invoke('getFFPath')
    if (!FFPath || typeof FFPath !== 'string') {
      throw new Error('无法从主进程获取有效的 FFmpeg 基础路径 (getFFPath)。')
    }
    console.log(`[渲染进程] FFmpeg 基础路径: ${FFPath}`)

    // --- 检查 Node API ---
    if (!window.nodeAPI?.path?.join || !window.nodeAPI?.fs?.existsSync) {
      throw new Error('预加载脚本未正确暴露 nodeAPI.path.join 或 nodeAPI.fs.existsSync。')
    }

    const exePath = window.nodeAPI.path.join(FFPath, 'ffmpeg.exe')
    console.log(`[渲染进程] 构造 FFmpeg.exe 路径: ${exePath}`)

    // --- 检查文件是否存在 (可选，主进程调用时也会检查) ---
    // 注意: existsSync 在渲染进程中直接检查主进程的文件系统路径可能不总是最佳实践，
    // 但如果 preload 脚本安全地暴露了它，并且路径是明确的，这里可以作为一个初步检查。
    // 主进程的 IPC 处理程序中应有更可靠的检查。
    // const exists = await window.nodeAPI.fs.existsSync(exePath); // existsSync 不是 async
    // if (!window.nodeAPI.fs.existsSync(exePath)) {
    //   throw new Error(`ffmpeg.exe 未在指定路径找到: ${exePath}`);
    // }

    ffmpegExePath.value = exePath // 存储路径
    console.log('[渲染进程] FFmpeg.exe 路径已设置:', ffmpegExePath.value)
    return true
  } catch (error: any) {
    console.error('[渲染进程] 检查 FFmpeg 路径失败:', error)
    errorMessage.value = `检查 FFmpeg 失败: ${error.message || String(error)}`
    ffmpegExePath.value = null
    return false
  } finally {
    isCheckingFFmpeg.value = false
  }
}

// --- 扫描视频文件中的字幕轨道 (使用 IPC) ---
async function discoverSubtitleTracks(inputVideoPath: string) {
  if (!ffmpegExePath.value) {
    console.warn('FFmpeg 路径未设置，无法扫描字幕。')
    ElNotification.warning({ title: '提示', message: '无法找到 FFmpeg 执行文件。', duration: 3000 })
    return
  }
  if (isDiscoveringSubtitles.value) return

  isDiscoveringSubtitles.value = true
  availableSubtitles.value = []
  selectedSubtitleIndex.value = -1 // 重置选择
  errorMessage.value = null
  console.log('开始通过 IPC 请求扫描字幕轨道...')

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'discover-subtitles',
      inputVideoPath,
      ffmpegExePath.value
    )

    // 假设主进程成功时返回 SubtitleTrack[]，失败时抛出错误或返回特定错误对象
    if (result && Array.isArray(result.subtitles)) {
      const subs: SubtitleTrack[] = result.subtitles
      availableSubtitles.value = subs // 更新UI列表
      console.log('从主进程接收到字幕轨道信息:', subs)

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
    } else {
      // 处理主进程返回了非预期格式数据的情况
      console.warn('主进程返回的字幕数据格式不正确:', result)
      ElNotification.warning({
        title: '警告',
        message: '扫描字幕时返回的数据格式异常。',
        duration: 3000
      })
      availableSubtitles.value = []
      selectedSubtitleIndex.value = -1
    }
  } catch (error: any) {
    console.error('IPC 调用扫描字幕轨道失败:', error)
    ElNotification.error({
      title: '扫描字幕失败',
      message: `无法扫描字幕轨道: ${error.message || String(error)}`,
      duration: 4000
    })
    errorMessage.value = '扫描字幕轨道时出错。'
    availableSubtitles.value = [] // 清空
    selectedSubtitleIndex.value = -1 // 重置
  } finally {
    isDiscoveringSubtitles.value = false // 结束扫描状态
    console.log('字幕扫描流程结束。')
  }
}

// --- 提取指定索引的字幕轨道并设置为 VTT (使用 IPC) ---
async function extractAndSetSubtitles(inputVideoPath: string, subtitleIndex: number) {
  if (!ffmpegExePath.value) {
    console.warn('FFmpeg 路径未设置，无法提取字幕。')
    ElNotification.warning({ title: '提示', message: '无法找到 FFmpeg 执行文件。', duration: 3000 })
    return
  }
  if (isProcessingSubs.value) {
    console.warn('已经在处理字幕，请稍候...')
    return
  }

  isProcessingSubs.value = true
  errorMessage.value = null
  console.log(`开始通过 IPC 请求提取字幕轨道索引: ${subtitleIndex}...`)

  await clearSubtitleTrack() // 清理旧字幕和可能存在的临时文件

  try {
    // 调用主进程进行提取，主进程应返回生成的 VTT 文件的路径
    const result = await window.electron.ipcRenderer.invoke(
      'extract-subtitle',
      inputVideoPath,
      ffmpegExePath.value,
      subtitleIndex
    )

    // 假设成功时返回 { vttFilePath: string }, 失败时抛出错误
    if (result && typeof result.vttFilePath === 'string') {
      const vttFilePath = result.vttFilePath
      console.log('主进程返回 VTT 文件路径:', vttFilePath)
      tempVttFilePath.value = vttFilePath // 保存临时文件路径用于清理

      // --- 读取 VTT 文件内容 ---
      // 确保 nodeAPI.fs.readFile 可用
      if (!window.nodeAPI?.fs?.readFile) {
        throw new Error('预加载脚本未暴露 nodeAPI.fs.readFile')
      }
      const vttData: Buffer = await window.nodeAPI.fs.readFile(vttFilePath)

      // --- 创建 Blob URL ---
      const vttBlob = new Blob([vttData], { type: 'text/vtt' })
      const newVttBlobUrl = URL.createObjectURL(vttBlob)
      vttBlobUrl.value = newVttBlobUrl // 保存新的 Blob URL
      subtitleUrl.value = newVttBlobUrl // 更新 track src

      console.log('字幕 VTT Blob URL 已创建:', subtitleUrl.value)

      // --- 尝试启用字幕 ---
      await nextTick()
      enableSubtitleTrack()
    } else {
      // 处理主进程返回了非预期格式数据的情况
      console.error('主进程提取字幕后返回的数据格式不正确:', result)
      throw new Error('主进程未能成功提取字幕文件。')
    }
  } catch (subError: any) {
    console.error(`IPC 调用提取字幕轨道 ${subtitleIndex} 失败:`, subError)
    ElNotification.error({
      title: '字幕提取失败',
      message: `无法提取所选字幕轨道 (${subtitleIndex})。 ${subError.message || String(subError)}`,
      duration: 4000
    })
    await clearSubtitleTrack() // 提取失败也要清理
    tempVttFilePath.value = null // 确保路径被清空
  } finally {
    isProcessingSubs.value = false
    console.log('字幕处理流程结束。')
  }
}

// --- 辅助函数 - 清除当前字幕轨道 (增加临时文件清理请求) ---
async function clearSubtitleTrack() {
  // 1. 清理渲染进程中的 Blob URL
  if (vttBlobUrl.value) {
    URL.revokeObjectURL(vttBlobUrl.value)
    console.log('旧的 VTT Blob URL 已撤销:', vttBlobUrl.value)
    vttBlobUrl.value = null
  }
  subtitleUrl.value = null

  // 2. 禁用 video 元素的 text track
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

  // 3. 如果存在临时 VTT 文件路径，请求主进程清理
  if (tempVttFilePath.value) {
    console.log(`请求主进程清理临时字幕文件: ${tempVttFilePath.value}`)
    try {
      console.log(`临时文件 ${tempVttFilePath.value} 清理请求已发送。`)
      await window.electron.ipcRenderer.invoke('cleanup-temp-file', tempVttFilePath.value)
    } catch (cleanupError) {
      console.error(`发送清理临时文件 ${tempVttFilePath.value} 的 IPC 请求失败:`, cleanupError)
    } finally {
      tempVttFilePath.value = null // 无论成功与否，都清除渲染进程中的记录
    }
  }
}

// --- 辅助函数 - 启用当前字幕轨道 (保持不变) ---
async function enableSubtitleTrack() {
  await nextTick()
  if (videoEl.value?.textTracks && videoEl.value.textTracks.length > 0) {
    let trackSet = false
    // 从后往前找，通常新添加的 track 在后面
    for (let i = videoEl.value.textTracks.length - 1; i >= 0; i--) {
      const track = videoEl.value.textTracks[i]
      // 检查 track 是否已被移除或无效
      if (!track || track.mode === undefined) continue

      if (track.kind === 'subtitles') {
        try {
          // 确保 track 对应的 <track> 元素存在于 DOM 中且 src 有效
          const trackElements = videoEl.value.querySelectorAll('track')
          const correspondingElement = Array.from(trackElements).find((el) => el.track === track)
          if (
            correspondingElement &&
            correspondingElement.src &&
            correspondingElement.readyState !== HTMLTrackElement.NONE
          ) {
            console.log(
              `尝试启用字幕轨道 ${i} (mode=showing), src=${correspondingElement.src}, readyState=${correspondingElement.readyState}.`
            )
            track.mode = 'showing'
            // 检查是否成功设置
            if (track.mode === 'showing') {
              console.log(`字幕轨道 ${i} 已成功启用。`)
              trackSet = true
              break
            } else {
              console.warn(
                `尝试设置轨道 ${i} mode 为 'showing' 后，读取到的 mode 仍然是 ${track.mode}`
              )
            }
          } else {
            console.warn(`字幕轨道 ${i} 对应的 <track> 元素无效或未加载，跳过启用。`)
          }
        } catch (trackError) {
          console.error(`设置字幕轨道 ${i} 模式时出错:`, trackError)
          // 出错时可能不应该立即 break，允许尝试其他轨道？
          // break;
        }
      } else {
        // 如果 track.kind 不是 subtitles，则禁用它，避免显示不必要的轨道 (如 metadata)
        if (track.mode !== 'disabled') {
          track.mode = 'disabled'
        }
      }
    }
    if (!trackSet) {
      console.warn('未能找到或成功启用目标字幕轨道。')
    }
  } else {
    console.warn('视频 TextTracks 不可用或为空，无法自动启用字幕。')
  }
}

// --- 处理字幕选择变化的事件处理器 (主体逻辑不变，调用新函数) ---
async function handleSubtitleSelection(selectedIndexValue: number | null | string) {
  // 将可能为 string 的值转换为 number
  const index =
    typeof selectedIndexValue === 'string' ? parseInt(selectedIndexValue, 10) : selectedIndexValue

  // 检查转换结果是否有效
  if (index === null || isNaN(index)) {
    console.warn('无效的字幕索引选择:', selectedIndexValue)
    // 可以选择重置为“无字幕”或保持当前状态
    // selectedSubtitleIndex.value = -1;
    // await clearSubtitleTrack();
    return
  }

  console.log(`用户选择字幕轨道索引: ${index}`)
  // 更新 v-model 绑定的值
  selectedSubtitleIndex.value = index

  // 清理旧字幕（包括请求清理临时文件）
  await clearSubtitleTrack()

  if (index >= 0 && props.videoUrl) {
    // 提取新选择的字幕
    await extractAndSetSubtitles(props.videoUrl, index)
  } else {
    console.log('已选择 "无字幕" 或索引无效，不提取新字幕。')
    // 确保 UI 和视频状态是无字幕状态
    if (videoEl.value?.textTracks) {
      for (let i = 0; i < videoEl.value.textTracks.length; i++) {
        if (videoEl.value.textTracks[i].kind === 'subtitles') {
          videoEl.value.textTracks[i].mode = 'disabled'
        }
      }
    }
  }
}

// --- 初始化播放器设置 (调用新的 checkNativeFFmpeg) ---
async function initializePlayer(videoPath: string) {
  console.log('初始化播放器设置...')
  VedioError.value = false
  await resetPlayerState() // 使用 await 确保清理完成
  errorMessage.value = null
  showFallbackOptions.value = false

  if (!videoEl.value) {
    errorMessage.value = '视频播放器元素尚未准备好。'
    return
  }

  try {
    // 1. 设置视频源
    console.log(`设置 video src 为: ${videoPath}`)
    // 对于本地文件，通常建议使用 file:// 协议，或者确保 Electron 配置允许加载本地路径
    // 如果 videoUrl 已经是正确的本地路径字符串，可以直接使用
    videoEl.value.src = videoPath // 或者 'file://' + videoPath (取决于你的环境和安全设置)
    videoEl.value.oncanplay = () => {
      console.log('视频已准备好播放 (canplay 事件)。')
    }

    // 2. 检查 FFmpeg.exe 路径
    const ffmpegReady = await checkNativeFFmpeg()

    // 3. 扫描字幕 (如果 FFmpeg 可用)
    if (ffmpegReady) {
      // 异步扫描，不阻塞播放器加载
      discoverSubtitleTracks(videoPath).catch((err) => {
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
      // FFmpeg 路径检查失败
      ElNotification.error({
        title: 'FFmpeg 检查失败',
        message: '无法找到 FFmpeg 执行文件，将不能扫描或提取内嵌字幕。',
        duration: 4000
      })
      availableSubtitles.value = []
      selectedSubtitleIndex.value = -1
    }
  } catch (error: any) {
    console.error('初始化播放器时出错:', error)
    errorMessage.value = `无法加载视频或检查 FFmpeg: ${error.message}`
    showFallbackOptions.value = true
  }
}

// --- 视频错误处理 (保持不变) ---
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
        VedioError.value = true // 设置错误状态
        break
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorText = '视频源格式不支持。尝试使用外部播放器打开。' // 修改提示
        VedioError.value = true // 设置错误状态
        break
      default:
        errorText = `发生未知视频错误 (Code: ${video.error.code})。`
    }
  }
  console.error('Video 元素错误:', errorText)
  errorMessage.value = errorText
  showFallbackOptions.value = true // 显示使用外部播放器打开的提示或按钮
}

// --- 关闭播放器 (调用 resetPlayerState) ---
async function closePlayer() {
  console.log('请求关闭播放器...')
  await resetPlayerState() // 使用 await
  emit('close')
}

// --- 重置播放器状态 (调用 clearSubtitleTrack) ---
async function resetPlayerState() {
  console.log('正在重置播放器状态...')

  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src') // 移除 src
    // 清空 <track> 元素
    // const tracks = videoEl.value.querySelectorAll('track')
    // tracks.forEach((track) => track.remove())
    videoEl.value.load() // 重新加载以应用更改
    videoEl.value.oncanplay = null
    console.log('Video 元素已重置。')
  }
  try {
    await clearSubtitleTrack() // 清理字幕状态和可能的临时文件
  } catch (err) {
    console.warn(err)
  }
  availableSubtitles.value = []
  selectedSubtitleIndex.value = -1 // 重置为无字幕

  errorMessage.value = null
  isProcessingSubs.value = false
  isDiscoveringSubtitles.value = false
  isCheckingFFmpeg.value = false // 重置检查状态

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
    // 确保 videoUrl 是主进程可以访问的路径
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

// --- 生命周期钩子 (调用 resetPlayerState) ---
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

onBeforeUnmount(async () => {
  console.log('组件即将卸载，执行最终清理...')
  await resetPlayerState() // 确保卸载前清理干净，特别是临时文件
  // 移除 ffmpeg 实例相关的清理
})

// --- 监听 videoUrl 变化 (逻辑不变，调用新函数) ---
watch(
  () => props.videoUrl,
  async (newUrl, oldUrl) => {
    // 改为 async
    if (newUrl && newUrl !== oldUrl) {
      console.log('视频 URL 已更改，重新初始化播放器。')
      await initializePlayer(newUrl) // 使用 await
    } else if (!newUrl && oldUrl) {
      console.log('视频 URL 已移除，重置播放器。')
      await resetPlayerState() // 使用 await
      errorMessage.value = '视频文件路径已移除。'
    }
  }
)
</script>

<style scoped lang="less">
/* 样式保持不变 */
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
