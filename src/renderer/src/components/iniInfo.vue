<!--
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-12 14:03:34
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-13 16:22:18
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
  <div class="hello" :style="`background-image: url(${bkg});`">
    <div class="mask">
      <div class="top">
        <div class="change" :class="{ able: done }" @click="change(-3)">
          <el-icon><ArrowLeft /></el-icon>
        </div>
        <div class="jidu">当前季度:{{ jidu }}</div>
        <div class="change" :class="{ able: done }" @click="change(3)">
          <el-icon><ArrowRight /></el-icon>
        </div>
      </div>
      <div
        v-for="(x, index) in info"
        style="overflow: hidden; display: flex; flex-wrap: wrap"
        class="ava"
        :key="index"
      >
        <div class="hr">
          <div class="xingqi">{{ xingqi[x.day] }}</div>
          <hr />
        </div>
        <div v-for="(i, index1) in x.children" class="normal" :key="index1">
          <router-link :to="`detail?key=${i['关键字']}`">
            <div :style="`background-image:url(${i['图床']})`" class="font"></div>
          </router-link>
          {{ i.Name }}
        </div>
        <br />
      </div>
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
.xingqi {
  width: 120px;
  margin: 10px;
  margin-right: 10px;

  font-size: 35px;
  align-self: center;
  // background: rgba(255, 255, 255, 0.1);
}

.hello {
  color: white;
  background: rgba(36, 40, 47, 1);
  background-size: auto 100%;
  animation: bkg 10s ease 0s infinite alternate;

  .mask {
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(6px);
  }
}

@keyframes bkg {
  0% {
    background-position: 50% 0;
  }

  50% {
    background-position: 50% -5px;
  }

  100% {
    background-position: 50% 5px;
  }
}

h3 {
  margin: 40px 0 0;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  display: inline-block;
  margin: 0 10px;
}

a {
  color: #42b983;
}

.hr {
  width: 100%;
}

hr {
  width: 98%;
}

.font {
  transition: all 0.5s ease;
  cursor: pointer;
  width: 205px;

  height: 242px;

  text-align: center;
  background: rgba(255, 255, 255, 0.2) center no-repeat;
  background-size: auto 96%;

  &:hover {
    background-size: auto 120%;
  }
}

.normal {
  margin: 0 10px 10px 10px;
  max-width: 200px;
}

.top {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: 20px;
  margin: 10px 0;

  div {
    // border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .change {
    width: 20px;

    display: flex;
    align-items: center;
    justify-content: center;
  }

  .able {
    cursor: pointer;
  }
}
</style>
