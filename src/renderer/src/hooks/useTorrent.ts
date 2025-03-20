import { useClientStore } from '@renderer/store/torrent'
import type { ITorrentRender } from '@Type/index'
// import { ITorrent } from '@Type/index'
// import { reactive, ref, Ref } from 'vue'
const { join } = window.nodeAPI.path
export function useTorrent(): {
  ClientStore: {
    AlltorrentsStore: ITorrentRender[]
    currentTorrent: ITorrentRender
    clientTorrentsStore: ITorrentRender[]
  }
  watchTorrents: () => void
} {
  const ClientStore = useClientStore()

  ;(async function (): Promise<void> {
    // @ts-ignore (define in dts)
    const DownloadStore = await window.electron.ipcRenderer.invoke('getDownloadStore')
    ClientStore.AlltorrentsStore = JSON.parse(DownloadStore)
  })()

  //监听torrents并更新,仅APP.vue引入执行
  function watchTorrents(): void {
    function assignIfDifferent(target: object, source: object): boolean {
      let changed = false
      for (const key in source) {
        if (target[key] !== source[key]) {
          target[key] = source[key]
          changed = true
        }
      }
      return changed
    }

    function sameTorrent(torrent1: ITorrentRender, torrent2: ITorrentRender): boolean {
      return torrent1.infoHash === torrent2.infoHash || torrent1.initURL == torrent2.initURL
    }
    // @ts-ignore (define in dts)
    window.electron.ipcRenderer.on('request-downloadstore', () => {
      const plainData = JSON.parse(JSON.stringify(ClientStore.AlltorrentsStore))
      // @ts-ignore (define in preload.dts)
      window.electron.ipcRenderer.send('exportDownloadStoreResponse', plainData)
    })

    window.electron.ipcRenderer.on('update-clients', (_event, data: ITorrentRender[]) => {
      ClientStore.clientTorrentsStore = data
      console.log(ClientStore.AlltorrentsStore, '<br><br>', data, 'br', ClientStore)
      for (const x of data) {
        const ToPatchTorrent = ClientStore.AlltorrentsStore.find((torrent) => {
          return sameTorrent(torrent, x)
        })

        if (ToPatchTorrent) {
          const { files, ...otherProps } = x
          console.log(assignIfDifferent(ToPatchTorrent, otherProps), 'patch')

          for (const file of files) {
            const ToPatchFile = ToPatchTorrent.files.find((f) => f.path === file.path)
            if (ToPatchFile) {
              console.log('patchfile')
              assignIfDifferent(ToPatchFile, file)
            } else {
              console.log('newfile')
              ToPatchTorrent.files.push({ ...file, initselected: false })
            }
          }
          if (!ToPatchTorrent.cleared) {
            //计算选中的文件 已下载的文件大小/总文件大小
            ToPatchTorrent.selectedTotal = ToPatchTorrent.files.reduce((acc, cur) => {
              if (cur.initselected) {
                return acc + cur.size
              } else {
                return acc
              }
            }, 0)
            ToPatchTorrent.selectedSize = ToPatchTorrent.files.reduce((acc, cur) => {
              if (cur.initselected) {
                return acc + cur.downloaded
              } else {
                return acc
              }
            }, 0)
            //清理未选中的文件碎片
            if (
              ToPatchTorrent.fileSelected &&
              ToPatchTorrent.selectedSize === ToPatchTorrent.selectedTotal
            ) {
              console.log('clear')
              ToPatchTorrent.files
                .filter((x) => !x.initselected)
                .forEach((file) => {
                  const filepath = join(ToPatchTorrent.path as string, file.path)
                  if (window.nodeAPI.fs.existsSync(filepath)) {
                    try {
                      window.nodeAPI.fs.unlinkSync(filepath)
                      console.log(`Deleted file: ${filepath}`)
                    } catch (err) {
                      console.error(`Failed to delete ${filepath}:`, err)
                    }
                  }
                })

              ToPatchTorrent.cleared = true
            }
          }
        }
      }
    })

    window.electron.ipcRenderer.on(
      'torrentError',
      (_event, torrentLink: string, message: string) => {
        const target = ClientStore.AlltorrentsStore.find((t) => t.initURL === torrentLink)
        if (target) {
          target.error = message
        }
      }
    )
  }

  return {
    ClientStore,
    watchTorrents
  }
}
