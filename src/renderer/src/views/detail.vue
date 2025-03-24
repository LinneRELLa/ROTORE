<template>
  <div class="detail-container">
    <div class="header">
      <h2 class="title">{{ route.query.key }}</h2>

      <div class="pagination">
        <el-button circle :disabled="page === 1" @click="getpage(String(route.query.key), --page)">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="current-page">第{{ page }}页</span>
        <el-button circle @click="getpage(String(route.query.key), ++page)">
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="node-list">
      <div v-for="(x, k) of nodes" :key="k" class="node-group">
        <h3 class="group-title">{{ k }}</h3>
        <div class="node-items">
          <div v-for="(i, ind) in x" :key="ind" class="node-item">
            <span class="node-title">{{ i.title }}</span>
            <el-button
              v-if="i.title !== '暂无结果' && i.title !== '正在加载'"
              type="primary"
              circle
              size="small"
              @click="copy(String(route.query.key), i.b, i.title)"
            >
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
// import { useStore } from 'vuex'
import { getInfo } from '../http'
import { useRoute } from 'vue-router'

type pagNode = { title: string; des?: string; b: string }
// // 定义响应式变量
// const fileName = ref<string|undefined>(undefined)
// const path = ref<string|undefined>(undefined)
const page = ref(1)
type Nodes = { [key in string]: pagNode[] } | object
const nodes = ref<Nodes>({ ROREL: [{ title: '正在加载...', b: '' }] })
const response = ref('')
// const last = ref('暂无')
// const key = ref<string|undefined>(undefined)
// const url = ref<string|undefined>(undefined)
// const des = ref<string|undefined>(undefined)

const route = useRoute()
// const store = useStore()

// // computed属性
// const Rdnd = computed(() => fileName.value ? 'Rdnd-active' : 'Rdnd')

// // 方法实现
// function Post():void {
//   addurl(key.value, url.value, des.value, path.value)
// }

// // function openPop(k: string, u: string, d: string):void {
// //   fileName.value = d
// //   key.value = k
// //   url.value = u
// //   des.value = d
// // }

async function copy(k: string, u: string, d: string): Promise<void> {
  await navigator.clipboard.writeText(u)
  window.alert(k + d + '复制成功')
}

// function openFile():void {
//   // @ts-ignore
//   window.$electron.ipcRenderer.invoke('selectpath', route.query.key).then((m: any) => {
//     if (m[0]) {
//       path.value = m[0]
//     }
//     console.log(m, 'm')
//   })
// }

// function backFunc():void {
//   fileName.value = undefined
// }

// function addurl(k: string|undefined, u: string|undefined, d: string|undefined, p: string|undefined):void {
//     console.log(k,u,d,p)
// //   if (!k || !u || !d) return
// //   back({ key: k, url: u, des: d }).then((res: any, err: any) => {
// //     if (err) {
// //       console.log('err')
// //     } else {
// //       console.log(res)
// //     }
// //   })
// //   add(k, u, p)
// //   if (p) {
// //     // @ts-ignore
// //     window.$electron.ipcRenderer.send('setstore', { key: 'path', des: p })
// //   }
// //   // @ts-ignore
// //   window.$electron.ipcRenderer.send('setstore', { key: k, des: d })
// //   // @ts-ignore
// //   window.$electron.ipcRenderer.invoke('getstore', k).then((m: any) => {
// //     console.log(m, 'm')
// //     last.value = m
// //   })
// //   window.alert('添加下载任务成功')
// }

function getpage(k: string, p: number): void {
  nodes.value = { ROREL: [{ title: '正在加载', b: '' }] }
  getInfo(k, p).then((res: { data: string }) => {
    response.value = res.data
    parse()
  })
}

function parse(): void {
  const pag: pagNode[] = []
  const a = response.value.match(/<item>(.|\n)*?<\/item>/gm) || []
  for (let x of a) {
    const title = x.replace(/(.|\n)*?<title>((.|\n)*?)<\/title>(.|\n)*/gm, '$2')
    const des = x.replace(/(.|\n)*?<description>((.|\n)*?)<\/description>(.|\n)*/gm, '$2')
    const link = x.replace(/(.|\n)*?<enclosure url="((.|\n)*?)"(.|\n)*\/>(.|\n)*/gm, '$2')
    let b: string
    // if (!store.state.proxy) {
    //   b = l.replace(/acg.rip/, 'tv.rellal.com:9099/acg')
    // } else {
    //   b = l
    // }
    b = link.replace(/acg.rip/, 'tv.rellal.com:9099/acg')
    pag.push({ title, des, b })
  }
  function nodetotree(array: pagNode[]): Nodes {
    if (!array.length) {
      return []
    }
    const result = array.reduce((acc: pagNode | object, cur: pagNode) => {
      const prefix = cur.title?.match(/^\[(.*?)\]/) || cur.title?.match(/^【(.*?)】/)
      if (prefix && prefix[1]) {
        if (!acc[prefix[1]]) {
          acc[prefix[1]] = []
        }
        acc[prefix[1]].push(cur)
      }
      return acc
    }, {})
    return result
  }
  nodes.value = nodetotree(pag)
  if (JSON.stringify(nodes.value) == '[]') {
    nodes.value = { ROREL: [{ title: '暂无结果', b: '' }] }
  }
  console.log(nodes.value)
}

// 生命周期挂载
onMounted(() => {
  getpage(String(route.query.key), page.value)
  //   window.$electron.ipcRenderer.invoke('getstore', route.query.key).then((m: any) => {
  //     console.log(m, 'm')
  //     last.value = m
  //   })
  //   // @ts-ignore
  //   window.$electron.ipcRenderer.invoke('getstore', 'path').then((m: any) => {
  //     console.log(m, 'm')
  //     path.value = m
  //   })
})
</script>

<style lang="less" scoped>
:root {
  --bg-color: #1a1a1a;
  --bg-color-secondary: #2a2a2a;
  --text-primary: rgba(255, 255, 255, 0.85);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --border-color: rgba(255, 255, 255, 0.12);
  --hover-bg: rgba(255, 255, 255, 0.08);
}

.detail-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);

  .title {
    font-size: 24px;
    color: var(--text-primary);
    margin: 0;
  }
}

.pagination {
  display: flex;
  align-items: center;
  gap: 16px;

  .current-page {
    font-size: 16px;
    color: var(--text-secondary);
  }
}

.node-list {
  display: grid;
  gap: 24px;
}

.node-group {
  background: var(--bg-color-secondary);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  .group-title {
    font-size: 18px;
    color: var(--text-primary);
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }
}

.node-items {
  display: grid;
  gap: 12px;
}

.node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 6px;
  transition: background 0.2s;

  &:hover {
    background: var(--hover-bg);
  }

  .node-title {
    flex: 1;
    font-size: 14px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 16px;
  }
}

// 移除所有未使用的样式
</style>
