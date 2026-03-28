import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common'
import { ChangeDetectorRef, Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { PLATFORM_ID } from '@angular/core'
import { Meta, Title } from '@angular/platform-browser'
import { Router } from '@angular/router'
import { Subscription } from 'rxjs'
import { finalize } from 'rxjs/operators'
import { environment } from '../../../environments/environment'
import { Farmacia } from '../../models/farmacia'
import { FarmaciasService } from '../../services/farmacias.service'
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service'

@Component({
  selector: 'app-farmacias-page',
  templateUrl: './farmacias-page.component.html',
  styleUrls: ['./farmacias-page.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class FarmaciasPageComponent implements OnInit, OnDestroy {
  @ViewChild('map', { static: true }) mapEl!: ElementRef<HTMLDivElement>

  comuna = 'temuco'
  farmacias: Farmacia[] = []
  mostrarTodas = false
  loading = false
  error: string | null = null
  readonly updatedLabel = this.formatLongDate(new Date())
  readonly shortUpdatedLabel = this.formatShortDate(new Date())

  private map?: any
  private infoWindow?: any
  private markers: any[] = []
  private markerByFarmacia = new Map<string, any>()
  private sub?: Subscription
  private hideLoadingTimeoutId?: number
  private initialLoadStartedAt = 0
  private readonly fallbackCenter = { lat: -38.735, lng: -72.59 }
  private readonly canonicalPath = environment.seoPath
  private readonly seoScriptIds = [
    'seo-webpage-jsonld',
    'seo-faq-jsonld',
    'seo-itemlist-jsonld',
    'seo-website-jsonld',
    'seo-breadcrumb-jsonld',
  ]
  private readonly isBrowser: boolean
  private readonly minimumInitialLoadingMs = 1200

  constructor(
    private service: FarmaciasService,
    private mapsLoader: GoogleMapsLoaderService,
    private cdr: ChangeDetectorRef,
    private title: Title,
    private meta: Meta,
    private router: Router,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId)
  }

  ngOnInit(): void {
    this.startInitialLoading()
    this.updateSeo()
    void this.initializePage()
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe()
    if (this.hideLoadingTimeoutId) {
      window.clearTimeout(this.hideLoadingTimeoutId)
    }
    this.clearMarkers()
    this.removeStructuredData()
  }

  load(): void {
    this.error = null
    this.sub?.unsubscribe()
    this.sub = this.service
      .getFarmacias(this.comuna)
      .pipe(finalize(() => this.finishInitialLoading()))
      .subscribe({
        next: (data) => {
          this.farmacias = data
          this.renderMarkers()
          this.updateSeo()
          this.cdr.detectChanges()
        },
        error: () => {
          this.error = 'No se pudo cargar la informacion'
          this.updateSeo()
          this.cdr.detectChanges()
        },
      })
  }

  get farmaciasDeTurno(): Farmacia[] {
    return this.farmacias.filter((farmacia) => farmacia.esDeTurno)
  }

  get farmaciasVisibles(): Farmacia[] {
    return this.mostrarTodas ? this.farmacias : this.farmaciasDeTurno
  }

  get farmaciasAbiertasAhora(): number {
    return this.farmacias.filter((farmacia) => farmacia.estaAbierta).length
  }

  get farmaciasCerradasAhora(): number {
    return this.farmacias.length - this.farmaciasAbiertasAhora
  }

  get farmaciasVisiblesAbiertasAhora(): number {
    return this.farmaciasVisibles.filter((farmacia) => farmacia.estaAbierta).length
  }

  get farmaciasConCoordenadas(): number {
    return this.farmaciasVisibles.filter((farmacia) => this.hasCoordinates(farmacia)).length
  }

  get farmaciasSinCoordenadas(): number {
    return this.farmaciasVisibles.length - this.farmaciasConCoordenadas
  }

  get resultadosVisiblesLabel(): string {
    return this.mostrarTodas ? 'Farmacias visibles del dia en Temuco' : 'Farmacias de turno visibles en Temuco'
  }

  get visibleListTitle(): string {
    return this.mostrarTodas ? 'Farmacias del dia en Temuco' : 'Farmacias de turno en Temuco'
  }

  get seoDescription(): string {
    if (this.farmacias.length > 0) {
      return `Consulta ${this.farmaciasDeTurno.length} farmacias de turno y ${this.farmaciasAbiertasAhora} farmacias abiertas ahora en Temuco hoy ${this.shortUpdatedLabel}, con mapa, direccion, telefono y horario actualizado.`
    }

    return `Consulta la farmacia de turno en Temuco hoy ${this.shortUpdatedLabel}, con mapa, direccion, telefono, horario y listado de farmacias abiertas ahora.`
  }

  get canonicalUrl(): string {
    return this.buildCanonicalUrl()
  }

  get isCanonicalRoute(): boolean {
    return this.router.url === this.canonicalPath
  }

  trackFarmacia(_index: number, farmacia: Farmacia): string {
    return this.getFarmaciaKey(farmacia)
  }

  formatHorario(value: string): string {
    if (!value || value === '24 horas') return value

    const parts = value.split('-')
    const formatPart = (part: string) => {
      const match = part.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
      if (match) {
        return `${match[1].padStart(2, '0')}:${match[2]}`
      }

      return part.trim()
    }

    if (parts.length === 2) {
      return `${formatPart(parts[0])} - ${formatPart(parts[1])}`
    }

    return formatPart(value)
  }

  cleanPhone(value: string): string {
    return String(value || '').replace(/[^\d+]/g, '')
  }

  focusFarmaciaOnMap(farmacia: Farmacia): void {
    if (!this.map || !this.hasCoordinates(farmacia)) {
      return
    }

    const marker = this.markerByFarmacia.get(this.getFarmaciaKey(farmacia))
    const position = { lat: farmacia.lat, lng: farmacia.lng }

    this.map.panTo(position)
    this.map.setZoom(Math.max(this.map.getZoom() ?? 13, 16))

    if (marker) {
      this.infoWindow?.setContent(this.buildInfoWindowContent(farmacia))
      this.infoWindow?.open({
        anchor: marker,
        map: this.map,
      })
    }

    this.mapEl.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  toggleMostrarTodas(event: Event): void {
    const input = event.target as HTMLInputElement | null
    this.mostrarTodas = !!input?.checked
    this.renderMarkers()
    this.updateSeo()
    this.cdr.detectChanges()
  }

  private async initializePage(): Promise<void> {
    if (!this.isBrowser) {
      this.load()
      return
    }

    try {
      await this.mapsLoader.load()
      this.initMap()
      this.load()
    } catch (error) {
      console.error('[FarmaciasPage] Google Maps init failed', error)
      this.error = 'No se pudo inicializar Google Maps'
      this.updateSeo()
      this.finishInitialLoading()
      this.cdr.detectChanges()
    }
  }

  private initMap(): void {
    if (!window.google?.maps) {
      return
    }

    const configuredMapId = window.__APP_CONFIG__?.googleMapsMapId?.trim() || environment.googleMapsMapId

    const options: Record<string, unknown> = {
      center: this.fallbackCenter,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',
    }

    if (configuredMapId) {
      options['mapId'] = configuredMapId
    }

    this.map = new window.google.maps.Map(this.mapEl.nativeElement, options)
    this.infoWindow = new window.google.maps.InfoWindow()
  }

  private renderMarkers(): void {
    if (!this.map || !window.google?.maps) return

    this.clearMarkers()
    const points = this.farmaciasVisibles.filter((farmacia) => this.hasCoordinates(farmacia))
    const bounds = new window.google.maps.LatLngBounds()

    points.forEach((farmacia) => {
      const position = { lat: farmacia.lat as number, lng: farmacia.lng as number }
      const marker = new window.google.maps.Marker({
        map: this.map,
        position,
        title: farmacia.nombre,
        icon: this.buildMarkerIcon(farmacia),
        zIndex: farmacia.esDeTurno ? 20 : 10,
      })

      marker.addListener('click', () => {
        this.infoWindow?.setContent(this.buildInfoWindowContent(farmacia))
        this.infoWindow?.open({
          anchor: marker,
          map: this.map,
        })
      })

      this.markers.push(marker)
      this.markerByFarmacia.set(this.getFarmaciaKey(farmacia), marker)
      bounds.extend(position)
    })

    if (points.length) {
      this.map.fitBounds(bounds, 72)
      window.google.maps.event.addListenerOnce(this.map, 'idle', () => {
        if (this.map.getZoom() > 16) {
          this.map.setZoom(16)
        }
      })
      return
    }

    this.map.setCenter(this.fallbackCenter)
    this.map.setZoom(13)
  }

  private buildMarkerIcon(farmacia: Farmacia): Record<string, unknown> {
    const fillColor = farmacia.esDeTurno ? '#2563eb' : farmacia.estaAbierta ? '#10b981' : '#fb7185'

    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      fillColor,
      fillOpacity: 0.95,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: farmacia.esDeTurno ? 10 : 8,
    }
  }

  private clearMarkers(): void {
    this.markers.forEach((marker) => marker.setMap(null))
    this.markers = []
    this.markerByFarmacia.clear()
  }

  private updateSeo(): void {
    const pageTitle = `Farmacia de turno en Temuco hoy (${this.shortUpdatedLabel}) | Abierta ahora`
    const canonicalUrl = this.canonicalUrl
    const description = this.seoDescription

    this.title.setTitle(pageTitle)
    this.setMetaTag('name', 'description', description)
    this.setMetaTag('name', 'robots', 'index,follow,max-image-preview:large')
    this.setMetaTag('name', 'author', 'farmaciastemuco.cl')
    this.setMetaTag('name', 'theme-color', '#0f172a')
    this.setMetaTag('property', 'og:title', pageTitle)
    this.setMetaTag('property', 'og:description', description)
    this.setMetaTag('property', 'og:type', 'website')
    this.setMetaTag('property', 'og:locale', 'es_CL')
    this.setMetaTag('property', 'og:url', canonicalUrl)
    this.setMetaTag('property', 'og:image', `${environment.siteUrl}/logo.png`)
    this.setMetaTag('name', 'twitter:card', 'summary_large_image')
    this.setMetaTag('name', 'twitter:title', pageTitle)
    this.setMetaTag('name', 'twitter:description', description)
    this.setMetaTag('name', 'twitter:image', `${environment.siteUrl}/logo.png`)
    this.updateCanonical(canonicalUrl)
    this.updateStructuredData(canonicalUrl, description)
  }

  private setMetaTag(attributeName: 'name' | 'property', attributeValue: string, content: string): void {
    this.meta.updateTag({ [attributeName]: attributeValue, content })
  }

  private updateCanonical(url: string): void {
    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null

    if (!canonical) {
      canonical = this.document.createElement('link')
      canonical.rel = 'canonical'
      this.document.head.appendChild(canonical)
    }

    canonical.href = url
  }

  private updateStructuredData(canonicalUrl: string, description: string): void {
    this.removeStructuredData()

    const webpage = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `Farmacia de turno en Temuco hoy (${this.shortUpdatedLabel})`,
      description,
      url: canonicalUrl,
      inLanguage: 'es-CL',
      about: 'Farmacias de turno y farmacias abiertas hoy en Temuco',
      dateModified: new Date().toISOString(),
    }

    const website = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'farmaciastemuco.cl',
      url: environment.siteUrl,
      inLanguage: 'es-CL',
    }

    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Inicio',
          item: environment.siteUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Farmacia de turno en Temuco',
          item: canonicalUrl,
        },
      ],
    }

    const faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Que farmacias de turno hay hoy en Temuco',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'En esta pagina puedes revisar las farmacias de turno disponibles hoy en Temuco con su direccion, telefono, horario y ubicacion en el mapa.',
          },
        },
        {
          '@type': 'Question',
          name: 'Tambien puedo ver farmacias abiertas en Temuco que no estan de turno',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Si. Ademas del listado por defecto de farmacias de turno, puedes activar la opcion para mostrar todas las farmacias del dia en Temuco y ver si estan abiertas o cerradas.',
          },
        },
        {
          '@type': 'Question',
          name: 'Como ver una farmacia en el mapa',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Cada farmacia con coordenadas disponibles permite abrir su ubicacion en el mapa para revisar rapidamente donde esta dentro de Temuco.',
          },
        },
      ],
    }

    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Farmacias de turno en Temuco',
      numberOfItems: this.farmaciasDeTurno.length,
      itemListElement: this.farmaciasDeTurno.slice(0, 25).map((farmacia, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Pharmacy',
          name: farmacia.nombre,
          address: {
            '@type': 'PostalAddress',
            streetAddress: farmacia.direccion || 'No informado',
            addressLocality: 'Temuco',
            addressCountry: 'CL',
          },
          telephone: farmacia.telefono || undefined,
          openingHours: farmacia.horario || undefined,
        },
      })),
    }

    this.appendStructuredData(this.seoScriptIds[0], webpage)
    this.appendStructuredData(this.seoScriptIds[1], faq)
    this.appendStructuredData(this.seoScriptIds[2], itemList)
    this.appendStructuredData(this.seoScriptIds[3], website)
    this.appendStructuredData(this.seoScriptIds[4], breadcrumb)
  }

  private appendStructuredData(id: string, payload: unknown): void {
    const script = this.document.createElement('script')
    script.type = 'application/ld+json'
    script.id = id
    script.text = JSON.stringify(payload)
    this.document.head.appendChild(script)
  }

  private removeStructuredData(): void {
    this.seoScriptIds.forEach((id) => this.document.getElementById(id)?.remove())
  }

  private buildCanonicalUrl(): string {
    return `${environment.siteUrl}${this.canonicalPath}`
  }

  private buildInfoWindowContent(farmacia: Farmacia): string {
    const nombre = this.escapeHtml(farmacia.nombre)
    const direccion = this.escapeHtml(farmacia.direccion || 'No informado')
    const telefono = this.escapeHtml(farmacia.telefono || 'No informado')
    const horario = this.escapeHtml(this.formatHorario(farmacia.horario) || 'No informado')
    const estado = farmacia.estaAbierta ? 'Abierta ahora' : 'Cerrada'
    const tipo = farmacia.esDeTurno ? 'De turno' : 'Farmacia del dia'

    return `<div class="map-popup">
      <div class="map-popup__title">${nombre}</div>
      <div><strong>Estado:</strong> ${estado}</div>
      <div><strong>Tipo:</strong> ${tipo}</div>
      <div><strong>Horario:</strong> ${horario}</div>
      <div><strong>Direccion:</strong> ${direccion}</div>
      <div><strong>Telefono:</strong> ${telefono}</div>
    </div>`
  }

  private hasCoordinates(farmacia: Farmacia): farmacia is Farmacia & { lat: number; lng: number } {
    return typeof farmacia.lat === 'number' && typeof farmacia.lng === 'number'
  }

  private getFarmaciaKey(farmacia: Farmacia): string {
    return farmacia.id || `${farmacia.nombre}-${farmacia.direccion}`
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private formatLongDate(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Santiago',
    }).format(date)
  }

  private formatShortDate(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Santiago',
    }).format(date)
  }

  private startInitialLoading(): void {
    this.loading = true
    this.initialLoadStartedAt = Date.now()
  }

  private finishInitialLoading(): void {
    const elapsed = Date.now() - this.initialLoadStartedAt
    const remaining = Math.max(0, this.minimumInitialLoadingMs - elapsed)

    if (this.hideLoadingTimeoutId) {
      window.clearTimeout(this.hideLoadingTimeoutId)
    }

    if (!this.isBrowser || remaining === 0) {
      this.loading = false
      this.cdr.detectChanges()
      return
    }

    this.hideLoadingTimeoutId = window.setTimeout(() => {
      this.loading = false
      this.hideLoadingTimeoutId = undefined
      this.cdr.detectChanges()
    }, remaining)
  }
}
