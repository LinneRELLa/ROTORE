export function useFile(): { readJSON: (path: string) => object } {
  function readJSON(path: string): object {
    try {
      const data = window.nodeAPI.fs.readFileSync(path, 'utf8')
      const jsonData = JSON.parse(data)
      return jsonData
    } catch (error) {
      return { message: error }
    }
  }
  return { readJSON }
}
