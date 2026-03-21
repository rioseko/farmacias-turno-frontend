import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http'
import { environment } from '../../environments/environment'
import { Observable, from, of } from 'rxjs'
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators'
import { Farmacia } from '../models/farmacia'

@Injectable({
  providedIn: 'root',
})
export class FarmaciasService {
  private readonly geocodingUrl = 'https://nominatim.openstreetmap.org/search'
  private readonly geocodingCachePrefix = 'farmacias-turno:geocode:temuco:'
  private readonly temucoBounds = {
    west: -72.69,
    north: -38.69,
    east: -72.53,
    south: -38.79,
  }

  constructor(private http: HttpClient) {}

  getFarmacias(comuna: string = 'temuco'): Observable<Farmacia[]> {
    const timestamp = new Date().getTime()
    // Verificamos si la URL ya tiene parámetros para decidir entre ? o &
    const separator = environment.apiUrl.includes('?') ? '&' : '?'
    const url = `${environment.apiUrl}${separator}t=${timestamp}`
    const normalizedComuna = this.normalizeText(comuna)

    return this.http.get<any[]>(url).pipe(
      map((data) => {
        if (!Array.isArray(data)) {
          console.error('Respuesta inesperada del proxy:', data)
          return []
        }

        return data
          .filter((item) => this.normalizeText(item.comuna_nombre || '') === normalizedComuna)
          .map((item) => {
            const coordinates = this.normalizeCoordinates(item.local_lat, item.local_lng)

            return {
              nombre: item.local_nombre || '',
              direccion: item.local_direccion || '',
              telefono: item.local_telefono || '',
              horario: this.buildHorario(item.funcionamiento_hora_apertura, item.funcionamiento_hora_cierre),
              lat: coordinates?.lat ?? null,
              lng: coordinates?.lng ?? null,
            }
          })
      }),
      switchMap((farmacias) => this.resolveCoordinatesByAddress(farmacias, normalizedComuna))
    )
  }

  private buildHorario(apertura: string, cierre: string): string {
    const a = (apertura || '').trim();
    const c = (cierre || '').trim();
    if (a && c) return `${a} – ${c}`;
    if (a || c) return a || c;
    return '';
  }

  private normalizeText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  }

  private normalizeCoordinates(rawLat: unknown, rawLng: unknown): Pick<Farmacia, 'lat' | 'lng'> | null {
    const lat = this.parseCoordinate(rawLat)
    const lng = this.parseCoordinate(rawLng)

    if (lat === null || lng === null) {
      return null
    }

    if (this.isWithinChile(lat, lng)) {
      return { lat, lng }
    }

    if (this.isWithinChile(lng, lat)) {
      return { lat: lng, lng: lat }
    }

    if (this.isWithinWorld(lat, lng) && lat !== 0 && lng !== 0) {
      return { lat, lng }
    }

    return null
  }

  private parseCoordinate(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null
    }

    const parsed = Number(String(value).trim().replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  private isWithinChile(lat: number, lng: number): boolean {
    return lat >= -56 && lat <= -17 && lng >= -76 && lng <= -66
  }

  private isWithinWorld(lat: number, lng: number): boolean {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  }

  private resolveCoordinatesByAddress(farmacias: Farmacia[], normalizedComuna: string): Observable<Farmacia[]> {
    if (normalizedComuna !== 'temuco' || !farmacias.length) {
      return of(farmacias)
    }

    return from(farmacias).pipe(
      concatMap((farmacia) => this.resolveFarmaciaAddressCoordinates(farmacia)),
      toArray()
    )
  }

  private resolveFarmaciaAddressCoordinates(farmacia: Farmacia): Observable<Farmacia> {
    const query = this.buildTemucoAddressQuery(farmacia.direccion)

    if (!query) {
      return of(farmacia)
    }

    const cached = this.readCachedCoordinates(query)
    if (cached) {
      return of({
        ...farmacia,
        lat: cached.lat,
        lng: cached.lng,
      })
    }

    return this.geocodeTemucoAddress(query).pipe(
      map((coordinates) => {
        if (!coordinates) {
          return farmacia
        }

        this.writeCachedCoordinates(query, coordinates)
        return {
          ...farmacia,
          lat: coordinates.lat,
          lng: coordinates.lng,
        }
      }),
      catchError(() => of(farmacia))
    )
  }

  private geocodeTemucoAddress(query: string): Observable<Pick<Farmacia, 'lat' | 'lng'> | null> {
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'jsonv2')
      .set('limit', '1')
      .set('countrycodes', 'cl')
      .set('bounded', '1')
      .set(
        'viewbox',
        `${this.temucoBounds.west},${this.temucoBounds.north},${this.temucoBounds.east},${this.temucoBounds.south}`
      )

    return this.http
      .get<Array<{ lat: string; lon: string }>>(this.geocodingUrl, {
        params,
        headers: new HttpHeaders({
          'Accept-Language': 'es',
        }),
      })
      .pipe(
        map((results) => {
          const first = results[0]
          if (!first) {
            return null
          }

          return this.normalizeCoordinates(first.lat, first.lon)
        })
      )
  }

  private buildTemucoAddressQuery(direccion: string): string | null {
    const cleaned = String(direccion || '')
      .replace(/\bN[°ºª]\s*/gi, ' ')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned) {
      return null
    }

    return `${cleaned}, Temuco, Chile`
  }

  private readCachedCoordinates(query: string): Pick<Farmacia, 'lat' | 'lng'> | null {
    try {
      const raw = window.localStorage.getItem(`${this.geocodingCachePrefix}${query}`)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown }
      return this.normalizeCoordinates(parsed.lat, parsed.lng)
    } catch {
      return null
    }
  }

  private writeCachedCoordinates(query: string, coordinates: Pick<Farmacia, 'lat' | 'lng'>): void {
    try {
      window.localStorage.setItem(`${this.geocodingCachePrefix}${query}`, JSON.stringify(coordinates))
    } catch {
      return
    }
  }
}
