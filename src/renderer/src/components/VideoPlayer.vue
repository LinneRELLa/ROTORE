<template>
  <div class="video-player-container">
    <div class="player-header">
      <h3>{{ fileName }}</h3>
      <el-icon class="close-btn" @click="$emit('close')"><Close /></el-icon>
      <!-- <el-icon><VideoPlay /></el-icon> -->
    </div>
    <video ref="videoPlayer" controls autoplay class="video-element" :src="videoUrl"></video>
  </div>
</template>

<script setup lang="ts">
defineProps({
  videoUrl: String,
  fileName: String
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
