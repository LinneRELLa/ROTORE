<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-13 13:46:44
 * @FilePath: \torrent\src\renderer\src\App.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-13 10:57:06
 * @FilePath: \torrent\src\renderer\src\App.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<script setup lang="ts">
import { ref } from 'vue'
let mes = ref<string>('')
const ipcRenderer = window.electron.ipcRenderer

// const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')
function minimize(): void {
  ipcRenderer.send('window-min')
}
function closewin(): void {
  ipcRenderer.send('window-close')
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    window.electron.ipcRenderer.send('toggle-devtools')
  }
})
</script>

<template>
  <div id="app">
    <div id="top">
      <div class="left">
        <img
          src="@renderer/assets/Xlogo2.png"
          style="height: 100%; position: absolute; left: 10px"
        />{{ mes }}
      </div>
      <div class="right">
        <div class="minimize" @click="minimize">一</div>
        <div class="close" @click="closewin">X</div>
      </div>
    </div>
    <div class="down">
      <div id="navload">
        <div id="nav">
          <router-link to="/home" active-class="active-icon" class="link">首页</router-link>
          <!-- <router-link to="/Message" active-class="active-icon" class="link">下载详情</router-link>
        <router-link
          to="/detail"
          active-class="active-icon"
          class="link"
          v-show="this.$route.name == 'detail'"
          >番剧详情</router-link
        >
        <router-link to="/option" active-class="active-icon" class="link">设置</router-link> -->
        </div>
      </div>
      <div class="cont"></div>
      <router-view />
    </div>
  </div>
</template>

<!-- 全局样式 -->
<style lang="less">
body,
html {
  padding: 0;
  margin: 0;

  &::-webkit-scrollbar {
    display: none;
    /* Chrome Safari */
  }
}
</style>

<!-- 组件局部样式 -->
<style lang="less" scoped>
#app {
  display: flex;
  flex-direction: column;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: white;
  background: rgba(36, 40, 47, 1);
  min-height: 100vh;
  min-width: 100vw;

  /* 顶部区域 */
  #top {
    display: flex;
    justify-content: space-around;
    gap: 4px;
    align-items: center;
    position: fixed;
    width: 100%;
    background: rgb(36, 40, 47);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    height: 31px;
    z-index: 90;
    top: 0;

    .left {
      flex: 1;
      height: 31px;
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      justify-content: center;

      img {
        float: left;
      }
    }

    .right {
      display: flex;

      div {
        cursor: pointer;
        z-index: 99;
        padding-right: 15px;
      }
    }
  }

  /* 内容下方区域 */
  .down {
    display: flex;
    flex-direction: columns;
    margin-top: 31px;
    width: 100%;
    height: calc(100vh - 31px);
  }
}

/* 导航和链接相关 */
a {
  text-decoration: none;
}

.link {
  font-size: 30px;
  color: white;
  display: block;
  width: 60px;
  margin: 10px 10px;

  &:hover {
    color: rgba(210, 210, 210, 0.7);
  }
}

nav {
  padding: 30px;

  a {
    font-weight: bold;
    color: #2c3e50;

    &.router-link-exact-active {
      color: #42b983;
    }
  }
}

#navload {
  width: 90px;
  border-right: 1px solid rgba(255, 255, 255, 0.3);
}

.active-icon {
  color: rgba(210, 210, 210, 0.7);
  background: rgba(100, 100, 100, 0.6);
  border-radius: 6px;
}
</style>
