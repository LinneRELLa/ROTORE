<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-20 16:06:04
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-04-16 21:06:15
 * @FilePath: \ElectronTorrent\src\renderer\src\views\HomeView.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div class="home">
    <iniInfo v-if="ConfigStore.PathConfig.homePath == 'local'" />

    <webview
      v-else
      :src="ConfigStore.PathConfig.homePath"
      class="content"
      nodeintegration
      plugins
    ></webview>
  </div>
</template>

<script setup lang="ts">
console.log('111111111111111111')
// @ is an alias to /src
import iniInfo from '@renderer/components/iniInfo.vue'
import { useFile } from '@renderer/hooks/useFile'
const { ConfigStore } = useFile()

// export default {
//   name: 'HomeView',
//   components: {
//     iniInfo
//   }
// }


</script>
<style lang="less" scoped>
.home {
  flex: 1;
  max-width: 100%;
  overflow-y: scroll;
  &::-webkit-scrollbar {
    display: none;
  }
  .content {
    width: 100%;
    height: 100%;
    min-height: calc(100vh - 60px);
  }
}
</style>
