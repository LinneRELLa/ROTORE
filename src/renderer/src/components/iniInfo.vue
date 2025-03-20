<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-12 14:03:34
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-20 17:07:37
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
              <div 
                class="item-image" 
                :style="{ backgroundImage: 'url(' + item['图床'] + ')' }"
              ></div>
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
.ini-info {
  min-height: 100vh;
  color: #fff;
  background-size: cover;
  background-position: center;
  animation: subtle-move 10s ease infinite alternate;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  
  .overlay {
    // background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(6px);
    border-radius: 8px;
    padding: 20px;
    width: 90%;
    max-width: 1200px;
  }
}

.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  gap: 20px;
  font-size: 20px;
  
  .change {
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    cursor: pointer;
    transition: transform 0.3s ease;
    
    &:hover,
    &.enabled {
      transform: scale(1.1);
    }
  }
  
  .quarter {
    font-weight: bold;
  }
}

.schedule {
  display: flex;
  flex-direction: column;
  gap: 20px;
  
  .day-schedule {
    display: flex;
    flex-direction: column;
    gap: 10px;
    
    .day-label {
      display: flex;
      align-items: center;
      gap: 10px;
      
      span {
        font-size: 24px;
        width: 120px;
      }
      
      hr {
        flex: 1;
        border: none;
        border-top: 1px solid #fff;
      }
    }
    
    .items {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      
      .item-link {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-decoration: none;
        color: inherit;
        width: 200px;
        
        .item-image {
          width: 200px;
          height: 240px;
          background-size: cover;
          background-position: center;
          border-radius: 4px;
          transition: transform 0.3s ease;
          
          &:hover {
            transform: scale(1.05);
          }
        }
        
        .item-name {
          margin-top: 8px;
          text-align: center;
        }
      }
    }
  }
}

@keyframes subtle-move {
  0% {
    background-position: center top;
  }
  100% {
    background-position: center bottom;
  }
}
</style>