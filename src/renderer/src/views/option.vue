<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-24 11:25:35
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-26 16:44:40
 * @FilePath: \ElectronTorrent\src\renderer\src\views\option.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div class="app-container">
    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">下载路径</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-input v-model="ConfigStore.PathConfig.downloadPath" placeholder="Please input" />
      </div>
    </div>

    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">外部播放器地址</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-input v-model="ConfigStore.PathConfig.playerPath" placeholder="Please input" />
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
async function save(): Promise<void> {
  console.log(ConfigStore)
  const filePath = await new Promise((resolve) => {
    ipcRenderer.invoke('getPath').then((meassage) => {
      resolve(meassage)
    })
  })
  const fileContent = JSON.stringify(ConfigStore.PathConfig, null, 2) // 格式化 JSON
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
  .savebutton{
    align-self: flex-start;
  }
  .app-content-body-main-content-content-item-title{
    width: 120px;
  }
  .app-content-body-main-content-content-item-content{
    width: 500px;
  }
}
</style>
