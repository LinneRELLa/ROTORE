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
