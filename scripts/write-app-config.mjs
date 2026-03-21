import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputPath = resolve(process.cwd(), 'public', 'app-config.js')
const envFiles = ['.env', '.env.local']

loadEnvFiles()

const config = {
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  googleMapsMapId: process.env.GOOGLE_MAPS_MAP_ID ?? '',
}

mkdirSync(resolve(process.cwd(), 'public'), { recursive: true })
writeFileSync(outputPath, `window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`, 'utf8')

function loadEnvFiles() {
  envFiles.forEach((fileName) => {
    const filePath = resolve(process.cwd(), fileName)
    if (!existsSync(filePath)) {
      return
    }

    const contents = readFileSync(filePath, 'utf8')
    contents.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return
      }

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) {
        return
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      const rawValue = trimmed.slice(separatorIndex + 1).trim()
      const value = stripQuotes(rawValue)

      if (key && !process.env[key]) {
        process.env[key] = value
      }
    })
  })
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
