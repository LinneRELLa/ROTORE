<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-27 08:40:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-04-01 09:41:03
 * @FilePath: \ElectronTorrent\src\renderer\src\views\option.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
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

    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">启用代理</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-switch v-model="ConfigStore.PathConfig.useProxy" @change="handleProxyChange" />
      </div>
    </div>
    <!-- 代理部分 -->
    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">代理地址</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-input
          v-model="ConfigStore.PathConfig.proxyPath"
          placeholder="格式示例: socks5://127.0.0.1:7890"
          :rules="[
            {
              validator: (_, v, cb) =>
                /^(https?|socks[45]):\/\/\S+:\d+/.test(v)
                  ? cb()
                  : cb(new Error('无效的代理地址格式'))
            }
          ]"
          :disabled="ConfigStore.PathConfig.useProxy"
        />
      </div>
    </div>
    <!-- 自定义首页 -->
    <div class="option-line">
      <div class="app-content-body-main-content-content-item-title">首页设置</div>
      <div class="app-content-body-main-content-content-item-content">
        <el-select v-model="ConfigStore.PathConfig.homePath" class="m-2" placeholder="Select">
          <el-option  :label="'默认'" :value="'local'" />
          <!-- <el-option  :label="'miobt'" :value="'http://www.miobt.com'" /> -->
          <el-option  :label="'acgrip[魔法]'" :value="'https://acgrip.art'" />
        </el-select>
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
//设置代理
const handleProxyChange = (useProxy: boolean): void => {
  ipcRenderer.send('toggle-proxy', {
    useProxy,
    proxyPath: ConfigStore.PathConfig.proxyPath
  })
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
