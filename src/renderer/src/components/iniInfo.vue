<template>
  <div class="ini-info">
    <div class="background-overlay"></div> <div class="content-container"> <header class="controls">
        <div class="navigation">
          <button class="nav-btn" :class="{ enabled: done }" @click="change(-3)" title="上一季度">
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <span class="quarter-display">{{ formatJidu(jidu) }}</span>
          <button class="nav-btn" :class="{ enabled: done }" @click="change(3)" title="下一季度">
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
        <div class="search-container">
          <el-input
            v-model="searchQuery"
            placeholder="搜索番剧..."
            clearable
            class="search-input"
            @keyup.enter="searchX"
            prefix-icon="Search"
          >
            </el-input>
        </div>
      </header>

      <section class="schedule-grid">
        <transition-group name="day-fade" tag="div" class="days-wrapper"> <article v-for="(dayInfo, dayIndex) in filteredInfo" :key="dayInfo.day" class="day-schedule">
            <div class="day-header">
              <span class="day-label">{{ xingqi[dayInfo.day] }}</span>
              <div class="divider"></div>
            </div>
            <transition-group name="item-fade" tag="div" class="items-grid">
              <router-link
                v-for="item in dayInfo.children"
                :key="item['关键字']"
                :to="`/detail?key=${encodeURIComponent(item['关键字'])}`"
                class="item-card"
              >
                <div class="item-image-wrapper">
                  <div
                    class="item-image"
                    :data-src="item['图床']"
                    ref="imageRefs"
                    :style="{
                      backgroundImage: loadedImages[item['图床']] ? 'url(' + item['图床'] + ')' : 'none', // 使用 none 替代空字符串
                      backgroundColor: !loadedImages[item['图床']] ? '#333' : 'transparent' // 加载时背景色
                    }"
                  >
                    <div v-if="!loadedImages[item['图床']]" class="image-placeholder">
                      <el-icon><Picture /></el-icon>
                      </div>
                  </div>
                </div>
                <div class="item-info">
                   <span class="item-name" :title="item.Name">{{ item.Name }}</span>
                </div>
              </router-link>
            </transition-group>
          </article>
        </transition-group>
        <div v-if="filteredInfo.length === 0 && !isLoading" class="no-results">
           没有找到匹配的番剧 (´•_•`)
        </div>
         <div v-if="isLoading" class="loading-indicator">
           <el-icon class="is-loading"><Loading /></el-icon>
           加载中...
        </div>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { normal } from '@renderer/http/index'
import { useRouter } from 'vue-router'
let done = ref<boolean>(false)
let jidu = ref<string>('获取中')
let info = ref<{ day: number; children: { 图床: string; 关键字: string; Name: string }[] }[]>([])
let xingqi = ref<string[]>(['x', '周一', '周二', '周三', '周四', '周五', '周六', '周日'])
const isLoading=ref(false)
function formatJidu(jidu: string): string {
  return jidu.slice(0, 2) + '年' + (jidu.slice(2) == 0 ? '10月' : jidu.slice(2) + '月')
}

function toload() {
  console.log('load')
  done.value = false
  let fangdou: NodeJS.Timeout | null = null
  isLoading.value=true;
  return function (): void {
    if (fangdou) {
      clearTimeout(fangdou)
    }

    fangdou = setTimeout(() => {
      normal({ jidu: jidu.value }).then((res) => {
        done.value = true
        info.value = []
        console.log(res.data)
        if (res.data) {
          if (jidu.value == '获取中') {
            jidu.value = res.data.jidu
          }

          for (let x = 1; x <= 7; x++) {
            info.value.push({ day: x, children: [] })
          }

          for (let x of res.data.res) {
            info.value[x.DAY - 1].children.push(x)
          }
          console.log(info.value)
          isLoading.value=false;
          nextTick(() => {
            observeImages()
          })
        }
      })
    }, 50)
  }
}
let load = toload()
load()

function change(x): void {
  if (done.value) {
    const number = Number(jidu.value)
    let z = Number(jidu.value[2])

    if (z == 0 && x == -3) {
      jidu.value = jidu.value[0] + jidu.value[1] + '7'
      load()
      return
    }
    if (x == 3 && z == 0) {
      jidu.value = String(number + 11)
      load()
      return
    }
    z += x
    if (z == -2) {
      jidu.value = String(number - 11)
      load()
      return
    }

    if (z == 10) {
      z = 0
    }
    jidu.value = jidu.value[0] + jidu.value[1] + z

    load()
  }
}
//搜索相关
const searchQuery = ref('')

const filteredInfo = computed(() => {
  const query = searchQuery.value.toLowerCase()
  if (!query) return info.value

  return info.value
    .map((day) => ({
      ...day,
      children: day.children.filter(
        (item) =>
          item.Name?.toLowerCase().includes(query) || item['关键字']?.toLowerCase().includes(query)
      )
    }))
    .filter((day) => day.children.length > 0)
})
const router = useRouter()

function searchX(): void {
  router.push(`/detail?key=${searchQuery.value}`)
}

//图片懒加载

const imageRefs = ref<HTMLElement[]>([]) // 存放所有图片的 DOM 引用
const loadedImages = ref<Record<string, boolean>>({}) // 记录哪些图片已加载

function loadImage(el: HTMLElement): void {
  const url = el.dataset.src
  if (!url || loadedImages.value[url]) return

  const img = new Image()
  img.src = url
  img.onload = () => {
    loadedImages.value[url] = true
    el.style.backgroundImage = `url(${url})`
  }
}

function observeImages(): void {
  console.log('observeImages')
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          console.log('intersec')
          loadImage(entry.target as HTMLElement)
        }
      }
    },
    { threshold: 0.1 }
  )

  imageRefs.value.forEach((el) => observer.observe(el))
}

onMounted(() => {})
</script>
<style scoped lang="less">
.ini-info {
  height: 100%; // 继承父容器高度
  width: 100%;
  position: relative; // 为遮罩层定位
  background-size: cover;
  background-position: center center;
  background-attachment: fixed; // 固定背景，滚动时更有层次感
  background-color: @content-bg; // 无背景图时的底色
  display: flex; // 使用 Flex 布局
  flex-direction: column; // 垂直排列
  overflow: hidden; // 防止 ini-info 自身滚动
}

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(18, 18, 18, 0.6); // 半透明黑色遮罩
  backdrop-filter: blur(10px) saturate(150%); // 增强毛玻璃效果
  z-index: 1;
}

.content-container {
  position: relative;
  z-index: 2;
  padding: 20px 24px; // 与 App.vue content-wrapper 一致
  flex: 1; // 占据剩余空间
  overflow-y: auto; // 内容本身可滚动
  display: flex;
  flex-direction: column;

  // 滚动条样式 (继承自全局或在此重新定义)
  &::-webkit-scrollbar { width: 6px; height: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(153, 153, 153, 0.4); border-radius: 3px; }
  &::-webkit-scrollbar-thumb:hover { background: rgba(153, 153, 153, 0.6); }
}


// --- Controls Header ---
.controls {
  display: flex;
  flex-wrap: wrap; // 允许换行
  align-items: center;
  justify-content: space-between; // 两端对齐
  gap: 16px;
  margin-bottom: 28px; // 增加底部间距
  padding: 10px;
  background: rgba(30, 30, 30, 0.6); // 控制栏背景
  border-radius: @border-radius-card;
  backdrop-filter: blur(5px);

  .navigation {
    display: flex;
    align-items: center;
    gap: 12px; // 调整导航按钮间距

    .nav-btn {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: @text-secondary;
      cursor: pointer;
      padding: 8px 10px; // 调整内边距
      border-radius: 6px; // 圆角
      transition: all @transition-duration ease;
      display: inline-flex; // 使图标居中
      align-items: center;
      justify-content: center;

      .el-icon {
        font-size: 18px; // 图标大小
      }

      &:hover {
        background: rgba(255, 255, 255, 0.2);
        color: @text-color;
        transform: scale(1.05); // 悬浮放大
      }

      // Consider disabling pointer events if not enabled
      // &:not(.enabled) {
      //   opacity: 0.5;
      //   cursor: not-allowed;
      // }
    }

    .quarter-display {
      font-size: 16px; // 字号
      font-weight: 600; // 加粗
      color: @text-color;
      padding: 6px 14px;
      background: rgba(0, 0, 0, 0.2); // 深色背景强调
      border-radius: 6px;
      white-space: nowrap; // 防止换行
    }
  }

  .search-container {
    flex-grow: 1; // 占据剩余空间
    max-width: 320px; // 限制最大宽度
    min-width: 200px; // 保证最小宽度

    .search-input {
      --el-input-bg-color: rgba(255, 255, 255, 0.1);
      --el-input-border-color: transparent;
      --el-input-hover-border-color: transparent;
      --el-input-focus-border-color: @primary-color;
      --el-input-placeholder-color: @text-secondary;
      --el-input-text-color: @text-color;
      --el-border-radius-base: 6px;

      :deep(.el-input__wrapper) {
        background-color: var(--el-input-bg-color);
        box-shadow: none; // 去掉默认阴影
        border-radius: var(--el-border-radius-base);
        transition: background-color @transition-duration ease, box-shadow @transition-duration ease;
        &:hover {
           background-color: rgba(255, 255, 255, 0.15);
        }
         &.is-focus {
           background-color: rgba(255, 255, 255, 0.12);
           box-shadow: 0 0 0 1px var(--el-input-focus-border-color) inset; // 焦点时内边框高亮
         }
      }
      :deep(.el-input__inner) {
         color: var(--el-input-text-color);
      }
       :deep(.el-input__prefix .el-input__icon) {
         color: @text-secondary;
       }
    }
  }
}

// --- Schedule Grid ---
.schedule-grid {
  flex: 1; // 占据剩余空间
  .days-wrapper { // transition-group 的外层容器
     display: flex;
     flex-direction: column;
     gap: 30px; // 日期间隔
  }
}

.day-schedule {
  .day-header {
    display: flex;
    align-items: center;
    margin-bottom: 16px; // 增加与下方卡片的间距

    .day-label {
      font-size: 18px; // 增大字号
      color: @text-color;
      font-weight: 600; // 加粗
      margin-right: 16px; // 与分割线间距
      white-space: nowrap;
    }

    .divider {
      flex: 1;
      height: 1px;
      // 使用渐变背景代替 hr
      background: linear-gradient(to right, @border-color, transparent);
    }
  }

  .items-grid { // transition-group 应用的元素
    display: grid;
    // 优化列定义，设置最小和最大宽度
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); // 稍微减小最小宽度
    gap: 20px; // 调整卡片间距
  }
}

// --- Item Card ---
.item-card {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: @text-color;
  background-color: @card-bg;
  border-radius: @border-radius-card;
  overflow: hidden; // 隐藏溢出的内容（如图片放大效果）
  transition: all @transition-duration ease-out; // 平滑过渡
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); // 基础阴影

  &:hover {
    transform: translateY(-6px) scale(1.03); // 悬浮效果更明显
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45); // 悬浮阴影加深
    z-index: 5; // 确保悬浮的卡片在最上层

    .item-image {
      transform: scale(1.1); // 图片轻微放大
    }
  }

  .item-image-wrapper {
    position: relative;
    width: 100%;
    // 使用 aspect-ratio 保持图片比例，如果浏览器支持的话
    aspect-ratio: 3 / 4; // 常见的海报比例
    // 如果不支持 aspect-ratio，可以使用 padding-top hack 或固定高度
    // height: 210px; // 或者固定高度
    border-radius: @border-radius-img @border-radius-img 0 0; // 图片顶部圆角
    overflow: hidden;
    background-color: #333; // 图片加载前的底色

    .item-image {
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
      transition: transform 0.4s ease-out, opacity 0.5s ease; // 图片过渡
      opacity: 1; // 默认可见
    }

    .image-placeholder {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: @text-secondary;
      font-size: 14px;
      text-align: center;
      pointer-events: none; // 不阻挡下方元素

      .el-icon {
         font-size: 36px; // 放大图标
         margin-bottom: 8px;
      }
    }
  }

  .item-info {
     padding: 10px 12px; // 调整内边距
     flex-grow: 1; // 占据剩余空间，使卡片高度一致（如果需要）
  }

  .item-name {
    font-size: 14px;
    line-height: 1.4;
    text-align: left; // 左对齐
    // 多行文字溢出显示省略号
    display: -webkit-box;
    -webkit-line-clamp: 2; // 最多显示 2 行
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-all; // 允许单词内换行
    min-height: calc(1.4em * 2); // 保证至少两行的高度，防止抖动
    color: @text-color; // 使用主要文字颜色
  }
}


// --- Loading & No Results ---
.loading-indicator,
.no-results {
   display: flex;
   align-items: center;
   justify-content: center;
   padding: 40px 20px;
   font-size: 16px;
   color: @text-secondary;
   width: 100%;
   text-align: center;

   .el-icon {
     margin-right: 8px;
     font-size: 20px;
   }
}

// --- Transition Animations ---

// 日期分组淡入淡出
.day-fade-enter-active,
.day-fade-leave-active {
  transition: opacity 0.5s ease;
}
.day-fade-enter-from,
.day-fade-leave-to {
  opacity: 0;
}

// 卡片项淡入 + 轻微上移
.item-fade-enter-active {
  transition: all 0.4s ease-out;
  transition-delay: calc(0.05s * var(--el-transition-index, 0)); // 基础延迟 + 索引延迟 (需要JS配合设置 --el-transition-index)
}
.item-fade-leave-active {
  transition: all 0.3s ease-in;
  position: absolute; // 离开时脱离文档流，防止抖动
  z-index: -1; // 确保在下方
}
.item-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.item-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
// 为了让 transition-group 的 move 生效，需要设置
.item-fade-move {
  transition: transform 0.5s ease;
}


</style>