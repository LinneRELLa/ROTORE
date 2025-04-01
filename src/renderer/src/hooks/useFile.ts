/*
 * @Author: chengp 3223961933@qq.com
 * @Date: 2025-03-18 11:13:03
 * @LastEditors: chengp 3223961933@qq.com
 * @LastEditTime: 2025-04-01 08:46:05
 * @FilePath: \ElectronTorrent\src\renderer\src\hooks\useFile.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { useConfigStore } from '@renderer/store/config'
import type { IPathConfig } from '@Type/index'
export function useFile(): {
  readJSON: (path: string) => object
  ConfigStore: { PathConfig: IPathConfig }
} {
  function readJSON(path: string): object {
    try {
      const data = window.nodeAPI.fs.readFileSync(path, 'utf8')
      const jsonData = JSON.parse(data)
      return jsonData
    } catch (error) {
      return { message: error }
    }
  }

  const ConfigStore = useConfigStore()
  return { readJSON, ConfigStore }
}
