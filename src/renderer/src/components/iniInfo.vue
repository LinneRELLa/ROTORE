<template>
  <div class="ini-info" :style="{ backgroundImage: 'url(' + bkg + ')' }">
    <div class="overlay">
      <header class="controls">
        <div class="navigation">
          <button class="change" :class="{ enabled: done }" @click="change(-3)">
            <el-icon>
              <ArrowLeft />
            </el-icon>
          </button>
          <span class="quarter">当前季度：{{ formatJidu(jidu) }}</span>
          <button class="change" :class="{ enabled: done }" @click="change(3)">
            <el-icon>
              <ArrowRight />
            </el-icon>
          </button>
        </div>
        <div class="search-container">
          <el-input
            v-model="searchQuery"
            placeholder="搜索番剧名称或关键字"
            clearable
            class="search-input"
          >
            <template #append>
              <el-button>
                <el-icon>
                  <Search @click="searchX" />
                </el-icon>
              </el-button>
            </template>
          </el-input>
        </div>
      </header>
      <section class="schedule">
        <article v-for="(dayInfo, dayIndex) in filteredInfo" :key="dayIndex" class="day-schedule">
          <div class="day-label">
            <span>{{ xingqi[dayInfo.day] }}</span>
            <hr />
          </div>
          <div class="items">
            <router-link
              v-for="item in dayInfo.children"
              :key="item['关键字']"
              :to="`/detail?key=${item['关键字']}`"
              class="item-link"
            >
              <div class="item-image-wrapper">
                <div
                  class="item-image"
                  :data-src="item['图床']"
                  ref="imageRefs"
                  :style="{
                    backgroundImage: loadedImages[item['图床']] ? 'url(' + item['图床'] + ')' : ''
                  }"
                >
                  <span v-if="!item['图床']" class="image-placeholder">暂无图片</span>
                </div>
              </div>
              <div class="item-name">{{ item.Name }}</div>
            </router-link>
          </div>
        </article>
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

function formatJidu(jidu: string): string {
  return jidu.slice(0, 2) + '年' + (jidu.slice(2) == 0 ? '10月' : jidu.slice(2) + '月')
}

function toload() {
  console.log('load')
  done.value = false
  let fangdou: NodeJS.Timeout | null = null

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
// Variables for consistent theming
@dark-bg: #1a1a1a;
@text-color: #e0e0e0;
@accent-color: #4a90e2;
@card-bg: rgba(40, 40, 40, 0.85);

.ini-info {
  min-height: 100vh;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: @dark-bg;
}

.overlay {
  background: @card-bg;
  backdrop-filter: blur(8px);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 1200px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 24px;
  color: @text-color;

  .change {
    background: none;
    border: none;
    color: @text-color;
    cursor: pointer;
    padding: 8px;
    transition: all 0.3s ease;

    &:hover,
    &.enabled {
      color: @accent-color;
      transform: translateY(-2px);
    }
  }

  .quarter {
    font-size: 18px;
    font-weight: 500;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
}

.schedule {
  display: flex;
  flex-direction: column;
  gap: 24px;

  .day-schedule {
    .day-label {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;

      span {
        font-size: 20px;
        color: @text-color;
        width: 100px;
        font-weight: 500;
      }

      hr {
        flex: 1;
        border: none;
        height: 1px;
        background: rgba(255, 255, 255, 0.2);
      }
    }

    .items {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;

      .item-link {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: @text-color;
        transition: transform 0.2s ease;

        &:hover {
          transform: translateY(-4px);
        }

        .item-image-wrapper {
          position: relative;
          width: 100%;
          height: 220px;
          border-radius: 8px;
          overflow: hidden;
          background: #333;

          .item-image {
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
            transition: opacity 0.3s ease;
          }

          .image-placeholder {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #888;
            font-size: 14px;
            text-align: center;
          }
        }

        .item-name {
          margin-top: 8px;
          font-size: 14px;
          text-align: center;
          line-height: 1.4;
          padding: 4px;
          word-break: break-word;
        }
      }
    }
  }
}

// Remove animation if not needed or adjust timing
@keyframes subtle-move {
  0% {
    background-position: center top;
  }

  100% {
    background-position: center bottom;
  }
}

//搜索相关
.controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;

  .navigation {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .search-container {
    flex: 1;
    max-width: 300px;
    min-width: 200px;
  }
}

// .search-input {
//   :deep(.el-input__inner) {
//     background-color: rgba(255, 255, 255, 0.1);
//     border: 1px solid rgba(255, 255, 255, 0.2);
//     color: #e0e0e0;
//     transition: all 0.3s ease;

//     &:focus {
//       border-color: #4a90e2;
//       box-shadow: 0 0 8px rgba(74, 144, 226, 0.3);
//     }
//   }

//   :deep(.el-input__prefix) {
//     color: rgba(224, 224, 224, 0.7);
//   }
// }

// .fade-enter-active,
// .fade-leave-active {
//   transition: all 2s ease;
//   position: absolute;
// }

// .fade-enter-from,
// .fade-leave-to {
//   opacity: 0;
//   transform: translateY(-10px);
// }

// .fade-move {
//   transition: transform 2s ease;
// }

.items {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
</style>
