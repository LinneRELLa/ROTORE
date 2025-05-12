/**
 * 表示单个文件的渲染时状态和属性。
 */
export interface IFileRender {
  name: string // 文件名
  path: string // 文件在种子内的相对路径
  type: string // 文件类型 (例如，'video/mp4', 'text/plain')
  progress: number // 下载进度 (0-1)
  selected: boolean // 用户是否选择下载此文件
  downloaded: number //已下载的字节数
  properties: string[] // 文件的其他属性或元数据
  _startPiece: number // 开始的 piece 索引 (内部使用)
  _endPiece: number // 结束的 piece 索引 (内部使用)
  offset: number // 文件在种子数据中的偏移量
  size: number // 文件总大小 (字节)
  initselected: boolean // 初始选择状态
  streamURL: string // 文件的流式播放 URL
}

/**
 * 表示单个种子任务的渲染时状态和属性。
 */
export interface ITorrentRender {
  name: string // 种子名称
  magnetURI: string // 磁力链接
  infoHash: string // 种子的 InfoHash
  size?: number // 种子总大小 (字节)
  progress?: number // 整体下载进度 (0-1)
  downloadSpeed?: number // 下载速度 (bytes/sec)
  path?: string // 种子文件保存路径
  uploadSpeed?: number // 上传速度 (bytes/sec)
  timeRemaining?: number // 预计剩余时间 (毫秒)
  downloaded?: number // 已下载的总字节数
  ratio?: number // 分享率 (上传/下载)
  numPeers?: number // 连接的 peer 数量
  files: IFileRender[] // 种子包含的文件列表
  initURL: string // 初始化的 URL (例如 magnet 或 .torrent 文件路径)
  fileSelected: boolean // 是否有文件被选择下载
  selectedSize: number // 已选择文件的总大小
  selectedTotal: number // 已选择文件的总数
  cleared: boolean // 标记是否已被用户清除或移除
  error: string // 发生的错误信息
}

/**
 * `ITorrentRender` 接口的实现类，提供了种子的基本结构。
 */
export class ITorrent implements ITorrentRender {
  constructor(
    public name: string = '',
    public magnetURI: string = '',
    public infoHash: string = '',
    public files: IFileRender[] = [],
    public initURL: string = '',
    public fileSelected: boolean = false,
    public selectedSize: number = 0,
    public selectedTotal: number = 0,
    public cleared: boolean = false,
    public error: string = ''
  ) {}
}

/**
 * 表示 WebTorrent 客户端中所有种子列表的渲染时状态。
 */
export interface IWebTorrentRender {
  torrents: ITorrentRender[] // 当前活动的种子任务列表
}

/**
 * 应用程序的路径配置信息。
 */
export interface IPathConfig {
  base: string // 应用基础路径
  proxy: string // 代理服务器地址
  source: string // 资源路径 (可能指 .torrent 文件或其他来源)
  downloadPath: string // 默认下载保存路径
  playerPath: string // 外部播放器路径
  useProxy: boolean // 是否启用代理
  proxyPath: string // 代理相关路径 (具体含义需结合上下文)
  homePath: string // 用户主目录或应用特定主目录
}
