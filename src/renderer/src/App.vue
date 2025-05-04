<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: Linne Rella 3223961933@qq.com
 * @LastEditTime: 2025-05-04 11:03:23
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

import { useNavigationStore } from '@renderer/store/navigation'
const navigationStore = useNavigationStore() // 2. 获取 Store 实例

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
    <header class="app-header">
      <div class="draggable-area">
        <img src="@renderer/assets/Xlogo2.png" class="app-logo" alt="logo" />
        <span class="app-title">{{ mes }}</span>
      </div>

      <div class="window-controls">
        <el-tooltip content="最小化" placement="bottom" :show-arrow="false" :offset="8">
          <div class="control-btn minimize" @click="minimize">
            <el-icon><Minus /></el-icon>
          </div>
        </el-tooltip>
        <el-tooltip content="关闭" placement="bottom" :show-arrow="false" :offset="8">
          <div class="control-btn close" @click="closewin">
            <el-icon><Close /></el-icon>
          </div>
        </el-tooltip>
      </div>
    </header>

    <main class="app-main">
      <nav class="app-sidebar">
        <div class="nav-menu">
          <router-link
            v-for="route in navRoutes"
            :key="route.path"
            :to="route.path"
            class="nav-item"
            active-class="active"
          >
            <el-tooltip :content="route.name" placement="right" :show-arrow="false" :offset="15">
              <el-icon class="nav-icon">
                <component :is="route.icon" />
              </el-icon>
            </el-tooltip>
          </router-link>

          <router-link
            v-if="navigationStore.hasLastDetail"
            :to="navigationStore.lastDetailPath"
            class="nav-item"
            active-class="active"
          >
            <el-tooltip
              :content="navigationStore.lastDetailName || '上次详情'"
              placement="right"
              :show-arrow="false"
              :offset="15"
            >
              <el-icon class="nav-icon">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </router-link>
        </div>
      </nav>

      <div class="content-wrapper">
        <router-view v-slot="{ Component, route }">
          <transition name="fade-transform" mode="out-in">
            <keep-alive include="detail">
              <component :is="Component" :key="route.fullPath" />
            </keep-alive>
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style lang="less">
body,
html {
  padding: 0;
  margin: 0;
  overflow: hidden; // 防止根元素滚动
  font-family:
    'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑',
    Arial, sans-serif; // 更现代的字体栈
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  * {
    box-sizing: border-box; // 统一盒模型

    // 优化滚动条样式
    &::-webkit-scrollbar {
      width: 6px; // 更窄
      height: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent; // 透明轨道
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(153, 153, 153, 0.4); // 稍微浅一点，半透明
      border-radius: 3px;
      transition: background 0.2s ease;
      &:hover {
        background: rgba(153, 153, 153, 0.6); // Hover 时加深
      }
    }
  }
}
</style>

<style lang="less" scoped>
// --- CSS Variables for Theming ---
.app-container {
  --header-height: 50px; // 稍微增加高度
  --sidebar-width: 75px; // 稍微窄一点
  --bg-color: #1c1c1e; // 稍深的背景
  --content-bg: #121212; // 内容区更深的背景
  --text-color: rgba(255, 255, 255, 0.87); // W3C 推荐的对比度
  --text-secondary: rgba(255, 255, 255, 0.6);
  --border-color: rgba(255, 255, 255, 0.1); // 更柔和的边框
  --primary-color: #0a84ff; // 苹果风格的蓝色
  --hover-bg: rgba(255, 255, 255, 0.08);
  --active-bg: var(--primary-color);
  --danger-color: #ff453a; // 苹果风格的红色
  --border-radius-base: 8px; // 统一圆角
  --transition-duration: 0.25s; // 统一过渡时间

  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  width: 100vw;
  overflow: hidden; // 确保容器本身不滚动
}

// --- Header ---
.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px; // 增加内边距
  // 使用更现代的背景效果
  background: rgba(28, 28, 30, 0.7); // 使用 --bg-color 的 alpha 透明度
  backdrop-filter: blur(12px) saturate(180%); // 毛玻璃效果
  border-bottom: 1px solid var(--border-color);
  position: relative;
  z-index: 1000;
  flex-shrink: 0; // 防止 header 被压缩

  .draggable-area {
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    gap: 10px; // 调整间距
    flex: 1;
    height: 100%;

    .app-logo {
      height: 26px; // 调整大小
      width: auto;
      transition: transform var(--transition-duration) ease;
      &:hover {
        transform: scale(1.05); // Logo 悬浮效果
      }
    }

    .app-title {
      font-size: 15px; // 调整字号
      font-weight: 600; // 稍微加粗
      color: var(--text-color); // 确保使用变量
    }
  }
}

// --- Window Controls ---
.window-controls {
  display: flex;
  gap: 10px; // 增加按钮间距
  -webkit-app-region: no-drag;

  .control-btn {
    width: 30px; // 调整大小
    height: 30px;
    border-radius: 50%; // 圆形按钮
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-secondary); // 使用次要文字颜色
    transition: all var(--transition-duration) ease;

    &:hover {
      background: var(--hover-bg);
      color: var(--text-color); // Hover 时用主要文字颜色
      transform: scale(1.1); // 增加缩放效果

      &.close:hover {
        background: var(--danger-color); // 使用危险色变量
        color: white;
      }
      &.minimize:hover {
        background: rgba(255, 255, 255, 0.15); // 最小化悬浮背景
      }
    }

    .el-icon {
      font-size: 16px; // 调整图标大小
    }
  }
}

// --- Main Area ---
.app-main {
  flex: 1;
  display: flex;
  overflow: hidden; // 防止 main 区域滚动条（由内部 content-wrapper 控制）
}

// --- Sidebar ---
.app-sidebar {
  width: var(--sidebar-width);
  border-right: 1px solid var(--border-color);
  background: rgba(28, 28, 30, 0.5); // 与 header 类似背景
  backdrop-filter: blur(10px); // 添加毛玻璃效果
  transition: width var(--transition-duration) ease; // 平滑宽度过渡
  padding: 16px 0;
  flex-shrink: 0; // 防止 sidebar 被压缩

  .nav-menu {
    display: flex;
    flex-direction: column;
    align-items: center; // 居中对齐
    gap: 12px; // 增加导航项间距
  }

  .nav-item {
    display: flex;
    justify-content: center; // 水平居中
    align-items: center; // 垂直居中
    width: 50px; // 固定宽度
    height: 50px; // 固定高度
    border-radius: var(--border-radius-base); // 使用基础圆角
    color: var(--text-secondary);
    transition: all var(--transition-duration) ease;
    cursor: pointer;
    position: relative; // 为伪元素定位

    &:hover {
      background: var(--hover-bg);
      color: var(--text-color); // Hover 时图标变亮
      transform: scale(1.05); // 轻微放大
    }

    &.active {
      background: var(--active-bg);
      color: white; // Active 状态文字/图标为白色

      // 添加一个强调的伪元素或阴影
      box-shadow: 0 0 10px rgba(10, 132, 255, 0.3); // 柔和辉光效果

      .nav-icon {
        transform: scale(1.1); // Active 时图标稍微放大
      }
    }

    .nav-icon {
      font-size: 24px;
      transition: transform var(--transition-duration) ease; // 图标缩放动画
    }

    // 如果未来要显示文字，可以这样设置
    .nav-text {
      font-size: 11px; // 小字号
      margin-top: 4px;
      font-weight: 500;
      opacity: 0; // 默认隐藏
      transition: opacity var(--transition-duration) ease;
    }

    // &.active .nav-text,
    // &:hover .nav-text {
    //  opacity: 1; // Hover 或 Active 时显示文字（如果启用）
    // }
  }
}

// --- Content Area ---
.content-wrapper {
  flex: 1;
  padding: 20px 24px; // 调整内边距
  overflow: auto; // 内部滚动
  position: relative;
  background-color: var(--content-bg); // 内容区域使用更深的背景

  // 确保滚动条样式也应用在这里
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(153, 153, 153, 0.4);
    border-radius: 3px;
    &:hover {
      background: rgba(153, 153, 153, 0.6);
    }
  }
}

// --- Router Transition Animation ---
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all 0.3s ease-out; // 优化过渡效果
}

.fade-transform-enter-from {
  opacity: 0;
  transform: translateY(15px); // 从下方轻微移入
}

.fade-transform-leave-to {
  opacity: 0;
  transform: translateY(-15px); // 向 T上方轻微移出
}
</style>
