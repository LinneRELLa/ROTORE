export function useFile(): object {
  function readJSON(path): object {
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
