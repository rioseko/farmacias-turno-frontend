import { Injectable } from '@angular/core'
import { environment } from '../../environments/environment'

declare global {
  interface AppConfig {
    googleMapsApiKey?: string
    googleMapsMapId?: string
  }

  interface Window {
    __APP_CONFIG__?: AppConfig
    __initGoogleMaps?: () => void
    google?: any
  }
}

@Injectable({
  providedIn: 'root',
})
export class GoogleMapsLoaderService {
  private loadingPromise?: Promise<any>
  private readonly scriptId = 'google-maps-javascript-api'
  private readonly callbackName = '__initGoogleMaps'

  load(): Promise<any> {
    if (window.google?.maps) {
      return Promise.resolve(window.google)
    }

    if (this.loadingPromise) {
      return this.loadingPromise
    }

    const apiKey =
      window.__APP_CONFIG__?.googleMapsApiKey?.trim() ||
      environment.googleMapsApiKey?.trim() ||
      window.localStorage.getItem('farmacias-turno:google-maps-api-key')?.trim() ||
      ''
    if (!apiKey) {
      return Promise.reject(
        new Error(
          "Google Maps API key is missing. Set environment.googleMapsApiKey or run localStorage.setItem('farmacias-turno:google-maps-api-key', '<KEY>')"
        )
      )
    }

    this.loadingPromise = new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error('Google Maps initialization timed out'))
      }, 15000)

      window[this.callbackName] = () => {
        window.clearTimeout(timeoutId)
        resolve(window.google)
      }

      const existingScript = document.getElementById(this.scriptId) as HTMLScriptElement | null
      if (existingScript) {
        existingScript.addEventListener('error', () => {
          window.clearTimeout(timeoutId)
          reject(new Error('Failed to load Google Maps script'))
        })
        return
      }

      const script = document.createElement('script')
      const params = new URLSearchParams({
        key: apiKey,
        callback: this.callbackName,
        loading: 'async',
        v: 'weekly',
      })

      script.id = this.scriptId
      script.async = true
      script.defer = true
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
      script.onerror = () => {
        window.clearTimeout(timeoutId)
        reject(new Error('Failed to load Google Maps script'))
      }

      document.head.appendChild(script)
    }).catch((error) => {
      console.error('[GoogleMapsLoader]', error)
      throw error
    })

    return this.loadingPromise
  }
}
