/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-11 13:33:14
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-03-14 13:05:47
 * @FilePath: \srce:\new\torrent\torrent\src\main\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const configPath = app.isPackaged
  ? join(process.resourcesPath, 'config/config.json') // 打包后的文件在 resources 目录下
  : join(app.getAppPath(), 'config/config.json')

// console.log(__dirname,configPath)

ipcMain.handle('getPath', async () => {
  return configPath
})

ipcMain.on('toggle-devtools', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.toggleDevTools()
  }
})
import trackerlist from './trackerlist.json'
function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: true,
    autoHideMenuBar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // process.env.HTTP_PROXY = 'http://127.0.0.1:7890';
  // process.env.HTTPS_PROXY = 'https://127.0.0.1:7890';
  // mainWindow.webContents.session.setProxy({
  //   proxyRules: 'socks5://127.0.0.1:7890'
  // })

  let timesignal

  async function loadWebTorrent(): Promise<void> {
    const WebTorrent = (await import('webtorrent')).default

    async function x(): Promise<void> {
      await new Promise((resolve, reject) => {
        // 在 Node 环境下运行的 WebTorrent 客户端会使用 TCP/UDP 协议进行数据交换
        const client = new WebTorrent()
        client.on('add', function () {
          console.log('add')
        })
        client.on('torrent', function () {
          console.log('torrent')
        })

        client.add(
          'https://acgrip.art/t/324893.torrent',
          { path: 'E:/', announce: trackerlist, paused: true },
          (torrent) => {
            torrent.deselect(0, torrent.pieces.length - 1, false)
            timesignal = setInterval(() => {
              const tosend = client.torrents.map((x) => {
                return {
                  _selections: x._selections,
                  name: x.name,
                  length: x.length,
                  announce: x.announce,
                  path: x.path,
                  paused: x.paused,
                  progress: x.progress,
                  downloadSpeed: x.downloadSpeed,
                  downloaded: x.downloaded,
                  numPeers: x.numPeers,
                  files: x.files.map((y, index) => {
                    if (index == 0) {
                      y.select()
                      torrent.resume()
                    }
                    // y.deselect();
                    const {
                      name,
                      path,
                      type,
                      progress,
                      downloaded,
                      _startPiece,
                      _endPiece,
                      offset,
                      size
                    } = y
                    return {
                      name,
                      path,
                      type,
                      progress,
                      selected: false,
                      downloaded,
                      properties: Object.getOwnPropertyNames(y),
                      _startPiece,
                      _endPiece,
                      offset,
                      size
                    }
                  })
                }
              })

              mainWindow.webContents.send('update-counter', tosend)
            }, 1000)

            torrent.on('download', (bytes) => {
              console.log('just downloaded: ' + bytes)
              console.log('total downloaded: ' + torrent.downloaded)
              console.log('download speed: ' + torrent.downloadSpeed)
              console.log('progress: ' + torrent.progress)
            })

            torrent.on('metadata', () => {
              mainWindow.webContents.send('update-counter', 'metadata')
              console.log('metadata', torrent)
            })
            torrent.on('error', (err: Error) => {
              console.log('1122211')
              console.log(err, 'error')
              reject(err.message)
            })
          }
        )
      })
    }
    x()
  }

  loadWebTorrent()

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        {
          click: (): void => mainWindow.webContents.toggleDevTools(),
          label: 'Decrement'
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  ipcMain.on('window-min', function () {
    console.log('minimize')
    mainWindow?.minimize()
  })
  ipcMain.on('window-close', async function () {
    clearTimeout(timesignal)
    app.quit()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
