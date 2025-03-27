<template>
  <div class="app-container">
    <!-- 下载路径部分 -->
    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">下载路径</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-input
          v-model="ConfigStore.PathConfig.downloadPath"
          placeholder="不建议设置为程序根目录，更新时可能会覆盖删除"
          
        >
          <template #append>
            <el-button @click="chooseDownloadPath"
              ><el-icon><Folder /></el-icon></el-button
          ></template>
        </el-input>
      </div>
    </div>

    <!-- 外部播放器路径部分 -->
    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">外部播放器路径</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-input
          v-model="ConfigStore.PathConfig.playerPath"
          placeholder="建议使用potplayer，示例:E:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
          
        >
          <template #append>
            <el-button @click="choosePlayerPath"
              ><el-icon><VideoPlay /></el-icon
            ></el-button>
          </template>
        </el-input>
      </div>
    </div>

    <el-button @click="save" class="savebutton">保存</el-button>
  </div>
</template>

<script setup lang="ts">
import { useFile } from '@renderer/hooks/useFile'
const { ConfigStore } = useFile()
const { fs } = window.nodeAPI
const ipcRenderer = window.electron.ipcRenderer

// 选择下载路径
const chooseDownloadPath = async (): Promise<void> => {
  const path = await ipcRenderer.invoke('open-directory-dialog')
  if (path) {
    ConfigStore.PathConfig.downloadPath = path
  }
}

// 选择播放器路径
const choosePlayerPath = async (): Promise<void> => {
  const path = await ipcRenderer.invoke('open-file-dialog')
  if (path) {
    ConfigStore.PathConfig.playerPath = path
  }
}

// 保存配置
async function save(): Promise<void> {
  const filePath = await ipcRenderer.invoke('getPath')
  const fileContent = JSON.stringify(ConfigStore.PathConfig, null, 2)
  fs.writeFileSync(filePath, fileContent, 'utf-8')
}
</script>

<style scoped lang="less">
.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  .option-line {
    display: flex;
    gap: 12px;
  }
  .savebutton {
    align-self: flex-start;
  }
  .app-content-body-main-content-content-item-title {
    width: 120px;
  }
  .app-content-body-main-content-content-item-content {
    width: 500px;
    display: flex;
  }
}
</style>
