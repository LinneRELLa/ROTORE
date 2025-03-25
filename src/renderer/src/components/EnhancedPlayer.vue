<template>
  <div class="enhanced-player">
    <div class="player-header">
      <h3>{{ fileName }}</h3>
      <el-icon class="close-btn" @click="$emit('close')"><Close /></el-icon>
    </div>

    <div class="video-container">
      <video
        ref="videoEl"
        class="video-js vjs-big-play-centered"
        :poster="poster"
        crossorigin="anonymous"
        playsinline
        webkit-playsinline
      ></video>

      <div v-show="showLoading" class="loading-indicator">
        <el-icon class="loading-icon"><Loading /></el-icon>
        <span>缓冲中... {{ bufferedPercent.toFixed(0) }}%</span>
      </div>
    </div>

    <div class="player-controls">
      <el-slider v-model="progress" :format-tooltip="formatProgress" @change="seekTo" />
      <div class="control-buttons">
        <el-button @click="togglePlay">
          <el-icon>
            <VideoPlay v-if="!isPlaying" />
            <VideoPause v-else />
          </el-icon>
        </el-button>
        <span class="time-display">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </span>
        <el-button @click="toggleMute">
          <el-icon>
            <Microphone v-if="!isMuted" />
            <TurnOffMicrophone v-else />
          </el-icon>
        </el-button>
        <el-slider v-model="volume" :max="1" :step="0.01" class="volume-slider" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import Hls from 'hls.js'


const props = defineProps({
  videoUrl: String,
  fileName: String,
  poster: String
})

const emit = defineEmits(['close'])

// 播放器状态
const videoEl = ref<HTMLVideoElement>()
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const progress = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const bufferedPercent = ref(0)
const showLoading = ref(true)

// 初始化播放器
let hls: Hls | null = null

const initPlayer = () => {
  if (!props.videoUrl) return
  // Clean up previous
  if (hls) {
    hls.destroy()
    hls = null
  }
  if (videoEl.value) {
    videoEl.value.src = ''
    videoEl.value.load()
  }
  const url = props.videoUrl
  const ext = url.split('.').pop()?.toLowerCase()
  try {
    if (ext === 'm3u8' && Hls.isSupported()) {
      initHlsPlayer(url)
    } else if (ext === 'mpd') {
      initDashPlayer(url)
    } else {
      initFilePlayer(url)
    }
  } catch (err) {
    console.error('播放器初始化失败:', err)
  }
}

// HLS流初始化
const initHlsPlayer = (url: string) => {
  hls = new Hls()
  hls.loadSource(url)
  hls.attachMedia(videoEl.value!)
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    videoEl.value?.play().catch((err) => console.error('Auto-play failed:', err))
  })
}

// 常规文件处理
const initFilePlayer = (url: string) => {
  if (videoEl.value) {
    videoEl.value.src = url
    videoEl.value.play().catch((err) => console.error('Auto-play failed:', err))
  }
}

// DASH流处理 (未实现)
const initDashPlayer = (url: string) => {
  console.log('DASH player not implemented')
  // TODO: implement using dash.js
}

// 事件监听
const onLoadedMetadata = () => {
  if (videoEl.value) {
    duration.value = videoEl.value.duration
  }
}
const onTimeUpdate = () => {
  if (videoEl.value) {
    currentTime.value = videoEl.value.currentTime
    if (duration.value > 0) {
      progress.value = (currentTime.value / duration.value) * 100
    }
  }
}
const onPlay = () => {
  isPlaying.value = true
}
const onPause = () => {
  isPlaying.value = false
}
const onVolumeChange = () => {
  if (videoEl.value) {
    volume.value = videoEl.value.volume
    isMuted.value = videoEl.value.muted
  }
}
const onProgress = () => {
  if (videoEl.value && duration.value > 0) {
    const buffered = videoEl.value.buffered
    if (buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1)
      bufferedPercent.value = (bufferedEnd / duration.value) * 100
    }
  }
}
const onWaiting = () => {
  showLoading.value = true
}
const onPlaying = () => {
  showLoading.value = false
}

const setupEventListeners = () => {
  if (!videoEl.value) return
  videoEl.value.addEventListener('loadedmetadata', onLoadedMetadata)
  videoEl.value.addEventListener('timeupdate', onTimeUpdate)
  videoEl.value.addEventListener('play', onPlay)
  videoEl.value.addEventListener('pause', onPause)
  videoEl.value.addEventListener('volumechange', onVolumeChange)
  videoEl.value.addEventListener('progress', onProgress)
  videoEl.value.addEventListener('waiting', onWaiting)
  videoEl.value.addEventListener('playing', onPlaying)
}

onMounted(() => {
  setupEventListeners()
  initPlayer()
})

onUnmounted(() => {
  if (videoEl.value) {
    videoEl.value.removeEventListener('loadedmetadata', onLoadedMetadata)
    videoEl.value.removeEventListener('timeupdate', onTimeUpdate)
    videoEl.value.removeEventListener('play', onPlay)
    videoEl.value.removeEventListener('pause', onPause)
    videoEl.value.removeEventListener('volumechange', onVolumeChange)
    videoEl.value.removeEventListener('progress', onProgress)
    videoEl.value.removeEventListener('waiting', onWaiting)
    videoEl.value.removeEventListener('playing', onPlaying)
  }
  hls?.destroy()
})

// 控制函数
const togglePlay = () => {
  if (!videoEl.value) return
  if (isPlaying.value) {
    videoEl.value.pause()
  } else {
    videoEl.value.play().catch((err) => console.error('Play failed:', err))
  }
}
const toggleMute = () => {
  isMuted.value = !isMuted.value
}
const seekTo = (percent: number) => {
  if (!videoEl.value) return
  videoEl.value.currentTime = (percent / 100) * duration.value
}

// 格式化函数
const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':')
}
const formatProgress = (percent: number) => {
  const time = (percent / 100) * duration.value
  return formatTime(time)
}

// 监听 props.videoUrl 变化
watch(
  () => props.videoUrl,
  () => {
    initPlayer()
  }
)

// 监听 volume 和 isMuted
watch(volume, (newVolume) => {
  if (videoEl.value) {
    videoEl.value.volume = newVolume
  }
})
watch(isMuted, (newMuted) => {
  if (videoEl.value) {
    videoEl.value.muted = newMuted
  }
})
</script>
<style lang="less" scoped>
.enhanced-player {
  background: var(--bg-color-secondary);
  border-radius: 8px;
  width: 800px;
  max-width: 90vw;

  .video-container {
    position: relative;
    background: #000;

    video {
      width: 100%;
      height: 450px;
    }

    .loading-indicator {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      display: flex;
      align-items: center;
      gap: 8px;

      .loading-icon {
        animation: rotating 2s linear infinite;
      }
    }
  }

  .player-controls {
    padding: 16px;

    .control-buttons {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 12px;

      .volume-slider {
        width: 100px;
      }

      .time-display {
        color: var(--text-secondary);
        font-size: 0.9em;
      }
    }
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
</style>
