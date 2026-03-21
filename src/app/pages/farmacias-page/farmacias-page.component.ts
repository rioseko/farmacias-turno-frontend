import { Component, OnDestroy, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core'
import { CommonModule } from '@angular/common'
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

  private map?: any
  private infoWindow?: any
  private markers: any[] = []
  private markerByFarmacia = new Map<string, any>()
  private sub?: Subscription
  private readonly fallbackCenter = { lat: -38.735, lng: -72.59 }

  constructor(
    private service: FarmaciasService,
    private mapsLoader: GoogleMapsLoaderService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.initializePage()
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe()
    this.clearMarkers()
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
          this.loading = false
          this.cdr.detectChanges()
        },
        error: () => {
          this.error = 'No se pudo cargar la informacion'
          this.loading = false
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

  trackFarmacia(_index: number, farmacia: Farmacia): string {
    return this.getFarmaciaKey(farmacia)
  }

  formatHorario(h: string): string {
    if (!h) return ''
    const parts = h.split('â€“')
    const fmt = (p: string) => {
      const m = p.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
      if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
      return p.trim()
    }
    if (parts.length === 2) return `${fmt(parts[0])} â€“ ${fmt(parts[1])}`
    return fmt(h)
  }

  cleanPhone(t: string): string {
    return String(t || '').replace(/[^\d+]/g, '')
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
    const points = this.farmacias.filter((f) => this.hasCoordinates(f))
    const bounds = new window.google.maps.LatLngBounds()

    points.forEach((f) => {
      const position = { lat: f.lat as number, lng: f.lng as number }
      const marker = new window.google.maps.Marker({
        map: this.map,
        position,
        title: f.nombre,
      })

      marker.addListener('click', () => {
        this.infoWindow?.setContent(this.buildInfoWindowContent(f))
        this.infoWindow?.open({
          anchor: marker,
          map: this.map,
        })
      })

      this.markers.push(marker)
      this.markerByFarmacia.set(this.getFarmaciaKey(f), marker)
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
}
