import { Component, OnDestroy, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FarmaciasService } from '../../services/farmacias.service'
import { Farmacia } from '../../models/farmacia'
import * as L from 'leaflet'
import { Subscription } from 'rxjs'
import { finalize } from 'rxjs/operators'

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

  private map?: L.Map
  private markers: L.Layer[] = []
  private sub?: Subscription
  private readonly fallbackCenter: L.LatLngExpression = [-38.735, -72.59]

  constructor(private service: FarmaciasService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.initMap()
    this.load()
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe()
    if (this.map) {
      this.map.remove()
    }
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
          this.error = 'No se pudo cargar la información'
          this.loading = false
          this.cdr.detectChanges()
        },
      })
  }

  private initMap(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      zoomControl: false,
    }).setView(this.fallbackCenter, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: ' OpenStreetMap',
    }).addTo(this.map)
    L.control.zoom({ position: 'bottomright' }).addTo(this.map)
  }

  private renderMarkers(): void {
    if (!this.map) return
    this.markers.forEach((m) => this.map!.removeLayer(m))
    this.markers = []
    const points = this.farmacias.filter((f) => this.hasCoordinates(f))
    points.forEach((f) => {
      const marker = L.circleMarker([f.lat as number, f.lng as number], {
        radius: 11,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 0.95,
      }).bindPopup(
        `<div class="map-popup">
          <div class="map-popup__title">${f.nombre}</div>
          <div><strong>Horario:</strong> ${this.formatHorario(f.horario) || 'No informado'}</div>
          <div><strong>Dirección:</strong> ${f.direccion || 'No informado'}</div>
          <div><strong>Teléfono:</strong> ${f.telefono || 'No informado'}</div>
        </div>`
      )
      marker.addTo(this.map!)
      this.markers.push(marker)
    })
    if (points.length) {
      const group = L.featureGroup(this.markers as L.Marker[])
      this.map.fitBounds(group.getBounds().pad(0.18), {
        maxZoom: 16,
      })
    } else {
      this.map.setView(this.fallbackCenter, 13)
    }
    window.requestAnimationFrame(() => this.map?.invalidateSize())
  }

  get farmaciasConCoordenadas(): number {
    return this.farmacias.filter((farmacia) => this.hasCoordinates(farmacia)).length
  }

  get farmaciasSinCoordenadas(): number {
    return this.farmacias.length - this.farmaciasConCoordenadas
  }

  trackFarmacia(_index: number, farmacia: Farmacia): string {
    return `${farmacia.nombre}-${farmacia.direccion}`
  }

  formatHorario(h: string): string {
    if (!h) return ''
    const parts = h.split('–')
    const fmt = (p: string) => {
      const m = p.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
      if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
      return p.trim()
    }
    if (parts.length === 2) return `${fmt(parts[0])} – ${fmt(parts[1])}`
    return fmt(h)
  }

  cleanPhone(t: string): string {
    return String(t || '').replace(/[^\d+]/g, '')
  }

  private hasCoordinates(farmacia: Farmacia): farmacia is Farmacia & { lat: number; lng: number } {
    return typeof farmacia.lat === 'number' && typeof farmacia.lng === 'number'
  }
}
