import { useClientStore } from '@renderer/store/torrent'
import type { ITorrentRender, ITorrentFileRender } from '@Type/index' // 引入文件类型
import { ITorrent } from '@Type/index' // 用于初始化 currentTorrent
import { nextTick } from 'vue' // 引入 nextTick

// 假设 window.nodeAPI 和 window.electron 已正确定义在 d.ts 文件中
const { join } = window.nodeAPI.path
const { fs } = window.nodeAPI // 需要 fs 来进行文件清理

export function useTorrent(): {
  ClientStore: ReturnType<typeof useClientStore> // 使用 Pinia store 的返回类型
  watchTorrents: () => void
} {
  const ClientStore = useClientStore()

  // 异步初始化：从本地存储加载下载记录
  ;(async function initializeStore(): Promise<void> {
    // @ts-ignore (暂时忽略 d.ts 检查)
    if (!ClientStore.inited) {
      try {
        console.log('useTorrent: 正在初始化 Store，请求 getDownloadStore...')
        const downloadStoreJson = await window.electron.ipcRenderer.invoke('getDownloadStore')
        const storedTasks = JSON.parse(downloadStoreJson || '{}') // 解析 JSON，提供默认空对象

        // 校验并恢复 AlltorrentsStore (可以添加更严格的类型检查)
        if (Array.isArray(storedTasks)) {
          // 确保恢复的数据结构符合 ITorrentRender，特别是 files 数组和其中的 initselected
          ClientStore.AlltorrentsStore = storedTasks.map(
            (task: any): ITorrentRender => ({
              ...new ITorrent(), // 提供默认值
              ...task, // 覆盖存储的值
              // 确保 files 数组和内部对象的结构正确
              files: Array.isArray(task.files)
                ? task.files.map(
                    (file: any): ITorrentFileRender => ({
                      ...file,
                      initselected: file.initselected === true // 确保存储的是布尔值
                    })
                  )
                : [],
              // 重置运行时状态
              paused: true, // 启动时默认暂停
              downloadSpeed: 0
              // error: '', // 可以保留错误信息
            })
          )
          ClientStore.AlltorrentsStore.forEach((task) => ClientStore.updateSelectedSize(task)) // 初始化选中大小
          console.log(`useTorrent: 从存储加载了 ${ClientStore.AlltorrentsStore.length} 个任务。`)
        } else {
          console.warn('useTorrent: 加载的 DownloadStore 不是一个数组，初始化为空。')
          ClientStore.AlltorrentsStore = []
        }

        ClientStore.inited = true // 标记为已初始化
      } catch (error) {
        console.error('useTorrent: 初始化 Store 时出错:', error)
        ClientStore.AlltorrentsStore = [] // 出错则初始化为空
        ClientStore.inited = true // 即使出错也标记为已初始化，避免重复加载
      }
    }
  })()

  // 监听主进程事件并更新 Store
  function watchTorrents(): void {
    // 辅助函数：比较两个 Torrent 是否相同 (优先 infoHash，后备 initURL)
    function sameTorrent(torrent1: ITorrentRender, torrent2: ITorrentRender): boolean {
      if (torrent1.infoHash && torrent2.infoHash && torrent1.infoHash === torrent2.infoHash) {
        return true
      }
      if (torrent1.initURL && torrent2.initURL && torrent1.initURL === torrent2.initURL) {
        return true
      }
      // 可以在这里添加更复杂的比较逻辑，例如 magnet 转 infohash
      return false
    }

    // 监听主进程请求下载记录的事件 (用于退出保存)
    // @ts-ignore (暂时忽略 d.ts)
    window.electron.ipcRenderer.on('request-downloadstore', () => {
      console.log('useTorrent: 收到 request-downloadstore，准备发送数据...')
      // 发送纯净数据，避免循环引用或 Proxy 问题
      try {
        const plainData = JSON.parse(JSON.stringify(ClientStore.AlltorrentsStore))
        // @ts-ignore (暂时忽略 d.ts)
        window.electron.ipcRenderer.send('exportDownloadStoreResponse', plainData)
      } catch (error) {
        console.error('序列化 AlltorrentsStore 出错:', error)
        // @ts-ignore (暂时忽略 d.ts)
        window.electron.ipcRenderer.send('exportDownloadStoreResponse', []) // 发送空数组以防主进程卡住
      }
    })

    // --- [核心修改] 监听主进程 'update-clients' 事件 ---
    window.electron.ipcRenderer.on(
      'update-clients',
      (_event, tasksFromServer: ITorrentRender[]) => {
        // console.log('Received update-clients data:', tasksFromServer) // 减少频繁输出

        // 更新 clientTorrentsStore (如果它有其他用途)
        ClientStore.clientTorrentsStore = tasksFromServer

        const localTasks = ClientStore.AlltorrentsStore
        const serverTaskMap = new Map<string, ITorrentRender>() // 使用 Map 提高查找效率
        const localTaskMap = new Map<string, ITorrentRender>()

        // 1. 建立服务端任务 Map (优先用 infoHash 做 key)
        tasksFromServer.forEach((serverTask) => {
          const key = serverTask.initURL || serverTask.infoHash
          if (key) {
            serverTaskMap.set(key, serverTask)
          } else {
            console.warn(
              'useTorrent: 收到来自服务端缺少 key (infoHash/initURL) 的任务:',
              serverTask
            )
          }
        })

        // 2. 建立本地任务 Map
        localTasks.forEach((localTask) => {
          const key = localTask.initURL || localTask.infoHash
          if (key) {
            localTaskMap.set(key, localTask)
          }
        })

        const finalTasks: ITorrentRender[] = [] // 用于构建最终的任务列表
        let storeChanged = false // 标记本地 Store 是否发生变化

        // 3. 遍历服务端任务：更新现有或识别新增
        serverTaskMap.forEach((serverTask, key) => {
          if (!serverTask.initURL) {
            return
          } //解析中的任务，不更新
          const localTask = localTaskMap.get(key)

          if (localTask) {
            // --- 情况 A: 任务本地已存在 -> 更新 ---
            const updatedTask = localTask // 直接修改 Pinia store 的对象以保持引用
            let taskUpdated = false

            // 更新顶层属性 (排除 files)
            const { files: serverFiles, ...otherServerProps } = serverTask
            for (const propKey in otherServerProps) {
              if (updatedTask[propKey] !== otherServerProps[propKey]) {
                // 暂时让服务器状态优先:
                updatedTask[propKey] = otherServerProps[propKey]
                taskUpdated = true
              }
            }

            // 更新文件列表 (核心：保留本地 initselected 状态)
            const updatedFiles: ITorrentFileRender[] = []
            const localFileMap = new Map(localTask.files?.map((f) => [f.path, f]) || []) // 处理 files 可能为空的情况
            let filesChanged = false
            let filesWereAdded = false // 标记是否有新文件加入（元数据首次加载）

            ;(serverFiles || []).forEach((serverFile: ITorrentFileRender) => {
              const localFile = localFileMap.get(serverFile.path)
              if (localFile) {
                // 更新现有文件属性
                const updatedFile = localFile // 直接修改
                let filePropsChanged = false
                for (const fileKey in serverFile) {
                  if (fileKey !== 'initselected' && updatedFile[fileKey] !== serverFile[fileKey]) {
                    updatedFile[fileKey] = serverFile[fileKey]
                    filePropsChanged = true
                  }
                }
                updatedFiles.push(updatedFile)
                if (filePropsChanged) filesChanged = true
                localFileMap.delete(serverFile.path) // 移除已处理标记
              } else {
                // 服务端有新文件 (通常发生在首次获取元数据后)
                updatedFiles.push({ ...serverFile, initselected: false }) // 添加并默认不选中
                filesChanged = true
                filesWereAdded = true // 标记有新文件加入
              }
            })

            // 检查是否有本地文件在服务端消失了（通常不该发生，但以防万一）
            // localFileMap.forEach(lostLocalFile => { /* 处理丢失的文件? */ });

            if (filesChanged) {
              updatedTask.files = updatedFiles
              taskUpdated = true
              if (filesWereAdded) {
                console.log(`任务 "${updatedTask.name}" 首次获取到文件列表。`)
                // 可以在这里触发一次保存，或者提示用户选择文件
                window.electron.ipcRenderer.send('writeTorrent')
              }
            }

            // 如果任务有更新，重新计算选中大小并检查是否完成
            if (taskUpdated) {
              ClientStore.updateSelectedSize(updatedTask) // 调用 Store action 更新大小
              // 检查任务完成状态和清理逻辑
              if (
                !updatedTask.cleared &&
                updatedTask.fileSelected &&
                updatedTask.selectedSize === updatedTask.selectedTotal &&
                updatedTask.selectedTotal > 0
              ) {
                console.log('任务完成，准备清理未选文件:', updatedTask.name)
                updatedTask.files
                  .filter((x) => !x.initselected)
                  .forEach((file) => {
                    const filepath = join(updatedTask.path as string, file.path)
                    if (fs.existsSync(filepath)) {
                      // 使用导入的 fs
                      try {
                        fs.unlinkSync(filepath) // 使用导入的 fs
                        console.log(`已删除未选文件: ${filepath}`)
                      } catch (err) {
                        console.error(`删除文件 ${filepath} 失败:`, err)
                      }
                    }
                  })
                updatedTask.cleared = true
                storeChanged = true // 标记状态已改变
                window.electron.ipcRenderer.send('writeTorrent') // 保存状态
              }
            }

            finalTasks.push(updatedTask) // 将更新后的任务加入最终列表
            localTaskMap.delete(key) // 移除本地任务标记，表示已处理
          } else {
            // --- 情况 B: 服务端有，本地没有 -> 新增任务 ---
            console.log(`发现新任务，添加到本地 Store: ${serverTask.name || key}`)
            const newTask: ITorrentRender = {
              ...new ITorrent(), // 获取默认字段
              ...serverTask, // 覆盖服务端数据
              fileSelected: false, // 新任务默认需要选择文件
              files: serverTask.files?.map((f: any) => ({ ...f, initselected: false })) || [], // 添加默认 initselected
              selectedSize: 0,
              selectedTotal: 0, // 稍后计算
              cleared:
                (serverTask.progress === 1 && serverTask.length > 0) ||
                (serverTask.downloaded >= serverTask.length && serverTask.length > 0),
              paused: serverTask.paused !== undefined ? serverTask.paused : true // 默认暂停或使用服务端状态
            }
            ClientStore.updateSelectedSize(newTask) // 计算初始大小
            finalTasks.push(newTask)
            storeChanged = true // 标记状态已改变
          }
        })

        // 4. 处理本地存在但服务端没有的任务 (可选，根据需要决定是否移除)
        localTaskMap.forEach((localTaskNotOnServer) => {
          // 这些任务可能是已完成并从 webtorrent client 移除，或者是在加载 store 时恢复的旧任务
          // 如果任务已完成 (cleared)，通常应该保留在列表里
          if (localTaskNotOnServer.cleared) {
            finalTasks.push(localTaskNotOnServer) // 保留已完成的任务
          } else {
            // 如果任务未完成但不在服务端列表里，可能表示它意外停止或被移除
            console.warn(
              `本地任务 "${localTaskNotOnServer.name}" 不在服务端更新中，可能已停止。暂时保留，标记为暂停。`
            )
            localTaskNotOnServer.paused = true // 标记为暂停
            localTaskNotOnServer.downloadSpeed = 0 // 速度归零
            finalTasks.push(localTaskNotOnServer)
            // 或者选择移除:
            // console.log(`本地任务 "${localTaskNotOnServer.name}" 不在服务端更新中，将其从列表移除。`);
            // storeChanged = true;
          }
        })

        // 5. 更新 Store (如果列表内容或顺序有变化)
        // Pinia 通常能检测到数组成员的修改，但如果顺序或长度变化，重新赋值数组更可靠
        if (
          storeChanged ||
          finalTasks.length !== localTasks.length ||
          localTasks.some((task, index) => !sameTorrent(task, finalTasks[index]))
        ) {
          console.log(
            `useTorrent: AlltorrentsStore 需要更新 (本地 ${localTasks.length}, 服务端 ${tasksFromServer.length}, 最终 ${finalTasks.length})`
          )
          // 排序 finalTasks (可选, 比如按添加时间或名称)
          // finalTasks.sort(...)
          ClientStore.AlltorrentsStore = finalTasks // 直接替换整个数组
        }
      }
    ) // update-clients listener 结束

    // 监听主进程发来的错误信息
    window.electron.ipcRenderer.on(
      'torrentError',
      (_event, torrentLink: string, message: string) => {
        console.log(`useTorrent: 收到 torrentError: ${torrentLink} - ${message}`)
        const target = ClientStore.AlltorrentsStore.find(
          (t) => t.initURL === torrentLink || t.infoHash === torrentLink
        )
        if (target) {
          target.error = message // 在任务对象上记录错误信息
          // 可以考虑添加一个短暂的通知
          // ElMessage.error(`任务 "${target.name}" 出错: ${message}`);
        }
      }
    )
  } // watchTorrents 函数结束

  return {
    ClientStore,
    watchTorrents
  }
}

// 确保 useClientStore action updateSelectedSize 已定义
// 例如，在 @renderer/store/torrent.ts 中:
/*
import { defineStore } from 'pinia';
import type { ITorrentRender } from '@Type/index';
import { ITorrent } from '@Type/index';

export const useClientStore = defineStore('client', {
  state: () => ({
    AlltorrentsStore: [] as ITorrentRender[],
    currentTorrent: new ITorrent() as ITorrentRender, // 或者 null
    clientTorrentsStore: [] as ITorrentRender[], // 来自服务器的原始数据
    inited: false,
  }),
  actions: {
    updateSelectedSize(torrent: ITorrentRender) {
      if (!torrent || !Array.isArray(torrent.files)) {
        if (torrent) {
            torrent.selectedSize = 0;
            torrent.selectedTotal = 0;
        }
        return;
      }
      torrent.selectedTotal = torrent.files.reduce((acc, cur) => {
        return acc + (cur.size || 0); // 确保 size 存在
      }, 0);
      torrent.selectedSize = torrent.files.reduce((acc, cur) => {
         // 这里应该只加 'initselected' 为 true 的文件下载量
         if (cur.initselected) {
            return acc + (cur.downloaded || 0); // 确保 downloaded 存在
         }
         return acc;
      }, 0);

      // 纠正：selectedTotal 应该只计算 initselected 为 true 的文件总大小
       torrent.selectedTotal = torrent.files.reduce((acc, cur) => {
         if (cur.initselected) {
            return acc + (cur.size || 0);
         }
         return acc;
       }, 0);


      // console.log(`计算 ${torrent.name}: 已选大小 ${torrent.selectedSize} / ${torrent.selectedTotal}`);
    },
  },
});

*/
