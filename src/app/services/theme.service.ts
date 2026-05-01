import { effect, Inject, Injectable, PLATFORM_ID, signal } from '@angular/core'
import { isPlatformBrowser } from '@angular/common'

export type Theme = 'light' | 'dark'

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'theme'
  private readonly isBrowser: boolean
  readonly theme = signal<Theme>('light')

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId)
    this.theme.set(this.resolveInitial())

    effect(() => {
      if (!this.isBrowser) return
      const t = this.theme()
      document.documentElement.classList.toggle('dark', t === 'dark')
      try {
        localStorage.setItem(this.storageKey, t)
      } catch {}
    })
  }

  toggle(): void {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'))
  }

  private resolveInitial(): Theme {
    if (!this.isBrowser) return 'light'

    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored === 'dark' || stored === 'light') return stored
    } catch {}

    return 'light'
  }
}
