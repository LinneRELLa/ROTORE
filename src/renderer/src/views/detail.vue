<template>
  <div id="hello">
    <!-- <div v-if="fileName!=undefined"  id="newTask" class="toollip">
            <div style="text-align: right;align-self: stretch;margin-bottom: 8px"><i class="el-icon-close" @click="back" style="cursor: pointer;"></i></div>
            <textarea v-model="fileName" class="textarea" rows="8" disabled></textarea>
            <p style="font-size: 10px;">下载到:</p>
            <div class="outin"><input  v-model="path" class="input" placeholder="下载目录（默认为当前目录下Download文件夹）">
                <el-button icon="el-icon-folder-opened" @click="openFile"></el-button>
            </div>
            <div :class="Rdnd" @click='Post'>立即下载</div>
        </div>
        <div  v-if="fileName!=undefined" id="mask"  @click="back()"></div>
        <div style="flex-basis: 100%;">{{route.query.key}}</div>
        <div style="flex:1;flex-basis: 100%;display: flex;justify-content: center;align-items: center;">
            <div @click="getpage(route.query.key,--page)" style="text-align: right;" class="fanye"><i class="el-icon-caret-left" v-if="this.page!=1" /></div>
            第{{page}}页
            <div @click="getpage(route.query.key,++page);" class="fanye"> <i class="el-icon-caret-right" /></div>
        </div>
       <div class="nodec">最近下载:{{this.last}}</div> 
        <div v-for="(x,k) of nodes" class="nodec" :key="k"> <span v-html="k" ></span>
            <div v-for="(i,ind) of x" class="node" :key="ind"><span v-html="i.t" ></span>
                <div style="display: flex;align-items: center;">
                          <button @click="copy(route.query.key,i.b,i.t)" v-if="(i.t!='暂无结果')&&i.t!='正在加载'" ><i class="el-icon-copy-document" /></i></button>
                 <button @click="openPop(route.query.key,i.b,i.t)" v-if="(i.t!='暂无结果')&&i.t!='正在加载'"><i class="el-icon-download" /></i></button>  
                </div>
         </div>
        </div>-->
    <div style="flex-basis: 100%">{{ route.query.key }}</div>
    <div
      style="flex: 1; flex-basis: 100%; display: flex; justify-content: center; align-items: center"
    >
      <div
        v-if="page != 1"
        style="text-align: right"
        class="fanye"
        @click="getpage(String(route.query.key), --page)"
      >
      <el-icon><ArrowLeft /></el-icon>
      </div>
      第{{ page }}页
      <div class="fanye" @click="getpage(String(route.query.key), ++page)">
        <el-icon><ArrowRight /></el-icon>
      </div>
      <div v-for="(x, k) of nodes" :key="k" class="nodec">
        <span v-html="k"></span>
        <el-icon><Memo /></el-icon>
        <div v-for="(i, ind) in x" :key="ind" class="node">
          <span v-html="i.title"></span>
          <div style="display: flex; align-items: center">
            <button
              v-if="i.title != '暂无结果' && i.title != '正在加载'"
              @click="copy(String(route.query.key), i.b, i.title)"
            >
            <el-icon><CopyDocument /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
// import { useStore } from 'vuex'
import { getInfo, back } from '../http'
import { useRoute } from 'vue-router'

type pagNode = { title: string; des?: string; b: string }
// // 定义响应式变量
// const fileName = ref<string|undefined>(undefined)
// const path = ref<string|undefined>(undefined)
const page = ref(1)
type Nodes = { [key in string]: pagNode[] }
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
  getInfo(k, p).then((res: any) => {
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
  function nodetotree(array: pagNode[]): any {
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
  // @ts-ignore
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

<style lang="less" scoped="">
#hello {
  display: flex;
  align-items: flex-start;
  align-content: flex-start;
  width: 100%;
}

div {
  font-size: 18px;
  text-align: left;
  flex-wrap: wrap;
  margin: 10px 10px 0 10px;
  font-size: 25px;
}

span:hover {
  cursor: pointer;
}

.fanye {
  &:hover {
    color: rgba(255, 255, 255, 0.3);
  }
}

.node {
  font-size: 18px;

  &:hover {
    background: rgba(199, 199, 210, 0.3);
  }

  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 0 40px;
}

.nodec {
  display: flex;
  justify-content: column;
  align-items: center;
  width: 100%;
}
</style>
<style lang="less" scoped>
.tasks {
  width: 400px;
  min-height: 200px;
  max-height: 400px;
  overflow: auto;
  position: relative;
}

.task:nth-of-type(1) {
}

.task:hover {
  background: rgba(229, 240, 254, 0.1);
}

#mask {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 3;
}

.toollip {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 500px;
  margin: 2px;
  background: rgba(48, 56, 65, 1);
  z-index: 4;
  border-radius: 3px;
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  padding: 2px 32px;
  flex-direction: column;
  border-radius: 4px;
  height: 350px;
}

.title {
  font-size: 16px;
  font-weight: 400;
  color: white;
  padding: 15px 40px;
}

#bkg {
  background: rgba(36, 40, 47);
  width: 100%;
  min-width: 728px;
}

.btn:hover {
  cursor: pointer;
  color: rgba(10, 10, 10, 0.5);
}

.btn {
  color: white;
}

#MessageRight {
  overflow: hidden;
  height: 100%;
  font-size: 128px;
  color: white;
  font-family: 'Vivaldi';
  position: relative;
}

#MessageLeft {
  float: left;
  border-right: 1px solid rgba(4, 4, 4, 0.3);
  height: 100%;
}

#Msgup {
  animation: come 1s ease;
}

#Msgdown {
  animation: come1 1s ease;
}

@keyframes come {
  0% {
    transform: perspective(2000px) translate3d(30px, 30px, 0);
  }

  100% {
    transform: perspective(2000px);
  }
}

@keyframes come1 {
  0% {
    transform: perspective(2000px) translate3d(-30px, -30px, 0);
  }

  100% {
    transform: perspective(2000px) translate3d(0, 0, 0);
  }
}

.Logo {
  transform-style: preserve-3d;
  position: absolute;
  margin: -64px -64px;
  left: 50%;
  top: 50%;
}

.tasktitle {
  width: calc(100% - 20px);
  background: rgb(36, 40, 47);
  overflow: hidden;
  padding: 5px 10px;
}

.content {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgb(211, 214, 218);
}

.operate {
  font-size: 20px;
  text-align: center;
}

.input {
  flex: 1 0 0;
  border: 1px solid rgb(230, 230, 230);
  border-radius: 3px 0 0 3px;
  background: rgba(48, 56, 66, 1);

  padding: 0 20px;
  color: white;
}

.textarea {
  width: calc(100% - 8px);
  border: 1px solid rgb(230, 230, 230);
  border-radius: 3px;
  color: white;
}

.textarea:focus-visible {
  border: 1px solid rgb(63, 133, 255);
}

textarea:focus {
  border: 1px solid rgb(63, 133, 255);
  outline: none;
}

input:focus {
  border: 1px solid rgb(63, 133, 255);
  outline: none;
}

.outin {
  width: 100%;
  display: flex;
  margin: 0;

  .el-button {
    background: rgba(48, 56, 66, 1);
    border-radius: 0 3px 3px 0;
    border-left: none;
  }
}

/*.outin::before {
    content: "电脑";
    display: inline-block;
    width: 40px;
    height: 40px;
    line-height: 40px;
    position: absolute;
    left: 40px;
}*/

.Rdnd {
  width: 100%;
  text-align: center;
  cursor: pointer;
  background: rgb(245, 245, 245);
  padding: 10px 0;
  margin: 20px 0;
  color: rgb(204, 204, 211);
}

.Rdnd-active {
  padding: 10px 0;
  width: 100%;
  text-align: center;
  cursor: pointer;
  background: rgb(38, 112, 234);
  font-size: 16px;
  margin: 20px 0;
  color: white;
}

#dnd {
  border: none;
  border-radius: 3px;
  background: rgba(231, 239, 251, 0.8);
  color: rgba(63, 133, 255);
  cursor: pointer;
  font-size: 18px;
  float: left;
  margin: 10px 20px;
}

#dnd:hover {
  background: rgba(231, 239, 251, 1);
}

#msg {
  border: none;
  border-radius: 3px;
  background: rgba(231, 239, 251, 0.8);
  color: rgba(63, 133, 255);
  font-size: 18px;
  float: left;
  user-select: none;
  margin: 10px 20px;
}

.red {
  color: red;
}

.btntop {
  border: none;
  border-radius: 3px;
  background: rgba(231, 239, 251, 0.8);
  color: rgba(63, 133, 255);
  cursor: pointer;
  font-size: 18px;
  float: left;
  margin: 10px 20px;
}
</style>
