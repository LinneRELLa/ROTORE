<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-12 14:03:34
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-21 16:46:52
 * @FilePath: \torrent\src\renderer\src\components\iniInfo.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-13 09:21:17
 * @FilePath: \torrent\src\renderer\src\App.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AEc
-->
<template>
  <div class="ini-info" :style="{ backgroundImage: 'url(' + bkg + ')' }">
    <div class="overlay">
      <header class="controls">
        <button class="change" :class="{ enabled: done }" @click="change(-3)">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <span class="quarter">当前季度：{{ jidu }}</span>
        <button class="change" :class="{ enabled: done }" @click="change(3)">
          <el-icon><ArrowRight /></el-icon>
        </button>
      </header>
      <section class="schedule">
        <article v-for="(dayInfo, dayIndex) in info" :key="dayIndex" class="day-schedule">
          <div class="day-label">
            <span>{{ xingqi[dayInfo.day] }}</span>
            <hr />
          </div>
          <div class="items">
            <router-link 
              v-for="(item, itemIndex) in dayInfo.children" 
              :key="itemIndex" 
              :to="`/detail?key=${item['关键字']}`"
              class="item-link"
            >
              <div class="item-image-wrapper">
                <div 
                  class="item-image" 
                  :style="item['图床'] ? { backgroundImage: 'url(' + item['图床'] + ')' } : {}"
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
import { ref } from 'vue'
import { normal, back } from '@renderer/http/index'

let done = ref<boolean>(false)
let jidu = ref<string>('获取中')
let info = ref<{ day: number; children: { 图床: string; 关键字: string; Name: string }[] }[]>([])
let xingqi = ref<string[]>(['x', '周一', '周二', '周三', '周四', '周五', '周六', '周日'])

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
  0% { background-position: center top; }
  100% { background-position: center bottom; }
}
</style>