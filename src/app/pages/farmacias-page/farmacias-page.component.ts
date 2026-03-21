import { CommonModule, DOCUMENT } from '@angular/common'
import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core'
import { Meta, Title } from '@angular/platform-browser'
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
  loading = false
  error: string | null = null
  readonly updatedLabel = this.formatLongDate(new Date())

  private map?: any
  private infoWindow?: any
  private markers: any[] = []
  private markerByFarmacia = new Map<string, any>()
  private sub?: Subscription
  private readonly fallbackCenter = { lat: -38.735, lng: -72.59 }
  private readonly canonicalPath = '/'
  private readonly seoScriptIds = ['seo-webpage-jsonld', 'seo-faq-jsonld', 'seo-itemlist-jsonld']

  constructor(
    private service: FarmaciasService,
    private mapsLoader: GoogleMapsLoaderService,
    private cdr: ChangeDetectorRef,
    private title: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.updateSeo()
    void this.initializePage()
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe()
    this.clearMarkers()
    this.removeStructuredData()
  }

  load(): void {
    this.loading = true
    this.error = null
    this.sub?.unsubscribe()
    this.sub = this.service
      .getFarmacias(this.comuna)
      .pipe(finalize(() => {
        this.loading = false
        this.cdr.detectChanges()
      }))
      .subscribe({
        next: (data) => {
          this.farmacias = data
          this.renderMarkers()
          this.updateSeo()
          this.loading = false
          this.cdr.detectChanges()
        },
        error: () => {
          this.error = 'No se pudo cargar la informacion'
          this.loading = false
          this.updateSeo()
          this.cdr.detectChanges()
        },
      })
  }

  get farmaciasConCoordenadas(): number {
    return this.farmacias.filter((farmacia) => this.hasCoordinates(farmacia)).length
  }

  get farmaciasSinCoordenadas(): number {
    return this.farmacias.length - this.farmaciasConCoordenadas
  }

  get seoDescription(): string {
    if (this.farmacias.length > 0) {
      return `Consulta ${this.farmacias.length} farmacias de turno en Temuco hoy, con mapa, direccion, telefono y horario actualizado.`
    }

    return 'Consulta las farmacias de turno en Temuco hoy con mapa, direccion, telefono y horarios actualizados.'
  }

  trackFarmacia(_index: number, farmacia: Farmacia): string {
    return this.getFarmaciaKey(farmacia)
  }

  formatHorario(value: string): string {
    if (!value) return ''

    const normalized = value.replace(/[–—]/g, '-')
    const parts = normalized.split('-')
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

    return formatPart(normalized)
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

  private async initializePage(): Promise<void> {
    try {
      await this.mapsLoader.load()
      this.initMap()
      this.load()
    } catch (error) {
      console.error('[FarmaciasPage] Google Maps init failed', error)
      this.error = 'No se pudo inicializar Google Maps'
      this.updateSeo()
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
    const points = this.farmacias.filter((farmacia) => this.hasCoordinates(farmacia))
    const bounds = new window.google.maps.LatLngBounds()

    points.forEach((farmacia) => {
      const position = { lat: farmacia.lat as number, lng: farmacia.lng as number }
      const marker = new window.google.maps.Marker({
        map: this.map,
        position,
        title: farmacia.nombre,
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

  private clearMarkers(): void {
    this.markers.forEach((marker) => marker.setMap(null))
    this.markers = []
    this.markerByFarmacia.clear()
  }

  private updateSeo(): void {
    const pageTitle = 'Farmacias de turno en Temuco hoy | Mapa y listado actualizado'
    const canonicalUrl = this.buildCanonicalUrl()
    const description = this.seoDescription

    this.title.setTitle(pageTitle)
    this.setMetaTag('name', 'description', description)
    this.setMetaTag('name', 'robots', 'index,follow,max-image-preview:large')
    this.setMetaTag('property', 'og:title', pageTitle)
    this.setMetaTag('property', 'og:description', description)
    this.setMetaTag('property', 'og:type', 'website')
    this.setMetaTag('property', 'og:locale', 'es_CL')
    this.setMetaTag('property', 'og:url', canonicalUrl)
    this.setMetaTag('name', 'twitter:card', 'summary_large_image')
    this.setMetaTag('name', 'twitter:title', pageTitle)
    this.setMetaTag('name', 'twitter:description', description)
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
      name: 'Farmacias de turno en Temuco hoy',
      description,
      url: canonicalUrl,
      inLanguage: 'es-CL',
      about: 'Farmacias de turno en Temuco',
      dateModified: new Date().toISOString(),
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
          name: 'La informacion de farmacias de turno en Temuco esta actualizada',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'La informacion se consulta desde la fuente oficial del Ministerio de Salud y se muestra enfocada solo en la comuna de Temuco.',
          },
        },
        {
          '@type': 'Question',
          name: 'Como ver una farmacia de turno en el mapa',
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
      numberOfItems: this.farmacias.length,
      itemListElement: this.farmacias.slice(0, 25).map((farmacia, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Pharmacy',
          name: farmacia.nombre,
          address: farmacia.direccion || 'Temuco',
          telephone: farmacia.telefono || undefined,
        },
      })),
    }

    this.appendStructuredData(this.seoScriptIds[0], webpage)
    this.appendStructuredData(this.seoScriptIds[1], faq)
    this.appendStructuredData(this.seoScriptIds[2], itemList)
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
    const origin = this.document.location?.origin ?? ''
    return `${origin}${this.canonicalPath}`
  }

  private buildInfoWindowContent(farmacia: Farmacia): string {
    return `<div class="map-popup">
      <div class="map-popup__title">${farmacia.nombre}</div>
      <div><strong>Horario:</strong> ${this.formatHorario(farmacia.horario) || 'No informado'}</div>
      <div><strong>Direccion:</strong> ${farmacia.direccion || 'No informado'}</div>
      <div><strong>Telefono:</strong> ${farmacia.telefono || 'No informado'}</div>
    </div>`
  }

  private hasCoordinates(farmacia: Farmacia): farmacia is Farmacia & { lat: number; lng: number } {
    return typeof farmacia.lat === 'number' && typeof farmacia.lng === 'number'
  }

  private getFarmaciaKey(farmacia: Farmacia): string {
    return `${farmacia.nombre}-${farmacia.direccion}`
  }

  private formatLongDate(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Santiago',
    }).format(date)
  }
}
