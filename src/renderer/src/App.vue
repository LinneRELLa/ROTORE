<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-26 16:42:36
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
import { useTorrent } from '@renderer/hooks/useTorrent'
const { watchTorrents } = useTorrent()
import { useFile } from '@renderer/hooks/useFile'
const { readJSON, ConfigStore } = useFile()
import type { IPathConfig } from '@Type/index'

let PathConfig: IPathConfig = {
  base: '',
  proxy: '',
  source: '',
  downloadPath: '',
  playerPath: '',
  useProxy: false,
  proxyPath: '',
  homePath: ''
}

const ipcRenderer = window.electron.ipcRenderer
async function readConfig(): Promise<void> {
  await new Promise((resolve) => {
    ipcRenderer.invoke('getPath').then((meassage) => {
      PathConfig = readJSON(meassage) as IPathConfig
      ConfigStore.PathConfig = PathConfig
      console.log(ConfigStore, 'ConfigStore')
      resolve(null)
    })
  })
}

readConfig()

watchTorrents()

let mes = ref<string>('')

// const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')
function minimize(): void {
  ipcRenderer.send('window-min')
}
function closewin(): void {
  ipcRenderer.send('window-close')
}
// @ts-ignore (define in preload.dts)
window.electron.ipcRenderer.on('update-counter', (_event, value) => console.log(value))

document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    // @ts-ignore (define in preload.dts)
    window.electron.ipcRenderer.send('toggle-devtools')
  }
})

const navRoutes = [
  { path: '/home', name: '首页', icon: 'House' },
  { path: '/download', name: '下载', icon: 'Download' },
  { path: '/option', name: '设置', icon: 'Setting' }
  // 其他路由...
]
</script>

<template>
  <div class="app-container">
    <!-- 顶部控制栏 -->
    <header class="app-header">
      <div class="draggable-area">
        <img src="@renderer/assets/Xlogo2.png" class="app-logo" alt="logo" />
        <span class="app-title">{{ mes }}</span>
      </div>

      <div class="window-controls">
        <el-tooltip content="最小化" placement="bottom">
          <div class="control-btn minimize" @click="minimize">
            <el-icon><Minus /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="关闭" placement="bottom">
          <div class="control-btn close" @click="closewin">
            <el-icon><Close /></el-icon>
          </div>
        </el-tooltip>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="app-main">
      <!-- 导航侧边栏 -->
      <nav class="app-sidebar">
        <div class="nav-menu">
          <router-link
            v-for="route in navRoutes"
            :key="route.path"
            :to="route.path"
            class="nav-item"
            active-class="active"
          >
            <el-icon class="nav-icon">
              <component :is="route.icon" />
            </el-icon>
            <!-- <span class="nav-text">{{ route.name }}</span> -->
          </router-link>
        </div>
      </nav>

      <!-- 内容区域 -->
      <div class="content-wrapper">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<!-- 全局样式 -->
<style lang="less">
body,
html {
  padding: 0;
  margin: 0;
  * {
    &::-webkit-scrollbar-track-piece {
      background: transparent;
      border-radius: 4px;
    }

    &::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    &::-webkit-scrollbar-thumb {
      background: #99999957;
      border-radius: 4px;
    }
  }
}
</style>

<!-- 组件局部样式 -->
<style lang="less" scoped>
.app-container {
  --header-height: 48px;
  --sidebar-width: 80px;
  --bg-color: #1a1a1a;
  --text-color: rgba(255, 255, 255, 0.85);
  --border-color: rgba(255, 255, 255, 0.12);
  --primary-color: #409eff;
  --hover-bg: rgba(255, 255, 255, 0.08);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  width: 100vw;
}

.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(8px);
  position: relative;
  z-index: 1000;

  .draggable-area {
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    height: 100%;
  }

  .app-logo {
    height: 28px;
    width: auto;
  }

  .app-title {
    font-size: 16px;
    font-weight: 500;
  }
}

.window-controls {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;

  .control-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--hover-bg);

      &.close:hover {
        background: #ff4d4f;
        color: white;
      }
    }

    .el-icon {
      font-size: 18px;
    }
  }
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.app-sidebar {
  width: var(--sidebar-width);
  border-right: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.3);
  transition: width 0.2s;

  .nav-menu {
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    margin: 0 8px;
    border-radius: 8px;
    color: var(--text-color);
    transition: all 0.2s;

    &:hover {
      background: var(--hover-bg);
    }

    &.active {
      background: var(--primary-color);
      color: white;
    }
  }

  .nav-icon {
    font-size: 24px;
    margin-bottom: 4px;
  }

  .nav-text {
    font-size: 12px;
  }
}

.content-wrapper {
  flex: 1;
  padding: 24px;
  overflow: auto;
  position: relative;
  &::-webkit-scrollbar-track-piece {
    background: transparent;
    border-radius: 4px;
  }

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: #99999957;
    border-radius: 4px;
  }
}

// 过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
