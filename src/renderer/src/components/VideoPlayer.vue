<template>
  <div class="simple-player">
    <div class="player-header">
      <h3>{{ fileName }}</h3>
      <el-icon class="close-btn" @click="$emit('close')"><Close /></el-icon>
    </div>

    <video
      v-if="supportedFormat"
      ref="videoEl"
      controls
      autoplay
      class="video-element"
      :src="videoUrl"
    ></video>

    <div v-else class="unsupported-prompt">
      <el-icon><Warning /></el-icon>
      <p>当前格式不支持播放</p>
      <el-button type="primary" @click="openSystemPlayer"> 使用系统播放器打开 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElNotification } from 'element-plus'
import { ref, onMounted } from 'vue'
const props = defineProps({
  videoUrl: String,
  fileName: String
})
const supportedFormat = ref(true)
const videoEl = ref<HTMLVideoElement>()
const checkFormatSupport = (): void => {
  if (!props.videoUrl) return

  const ext = props.fileName?.split('.').pop()?.toLowerCase()
  const mimeType = {
    mp4: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo'
  }[ext || '']

  supportedFormat.value = mimeType ? videoEl?.value?.canPlayType(mimeType) !== '' : false
}

// 打开系统播放器
// const openSystemPlayer = async (): Promise<void> => {
//   try {
//     await window.nodeAPI.shell.openPath(props.videoUrl)
//   } catch (err) {
//     ElNotification.error(`打开失败: ${err}`)
//   }
// }

const openSystemPlayer = async (): void => {
  try {
    const result = await window.electron.ipcRenderer.invoke('open-with-player', props.videoUrl)

    ElNotification.success({
      title: '播放成功',
      message: `正在使用 ${result.player} 播放`,
      duration: 2000
    })
  } catch (err) {
    ElNotification.error({
      title: '播放失败',
      message: err as string,
      duration: 5000
    })

    // 终极降级方案：用浏览器打开
    // window.nodeAPI.shell.openExternal(props.videoUrl)
  }
}
onMounted(() => {
  checkFormatSupport()
})
defineEmits(['close'])
</script>

<style scoped lang="less">
.video-player-container {
  background: var(--bg-color-secondary);
  border-radius: 8px;
  overflow: hidden;
  width: 800px;
  max-width: 90vw;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
}

.video-element {
  width: 100%;
  height: 450px;
  background: black;
}

.unsupported-prompt {
  padding: 2rem;
  text-align: center;
  background: var(--bg-color);

  .el-icon {
    font-size: 3rem;
    color: var(--el-color-warning);
    margin-bottom: 1rem;
  }

  p {
    margin: 1rem 0;
    color: var(--el-text-color-regular);
  }
}

.close-btn {
  cursor: pointer;
  //   padding: 8px;
  border-radius: 50%;
  transition: background 0.2s;

  &:hover {
    background: var(--hover-bg);
  }
}
</style>
