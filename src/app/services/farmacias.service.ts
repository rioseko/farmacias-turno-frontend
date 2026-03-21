import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http'
import { environment } from '../../environments/environment'
import { Observable, forkJoin, from, of, throwError } from 'rxjs'
import { catchError, concatMap, map, switchMap, timeout, toArray } from 'rxjs/operators'
import { Farmacia } from '../models/farmacia'

interface FarmaciaApiResponse {
  local_id?: string
  local_nombre?: string
  comuna_nombre?: string
  localidad_nombre?: string
  local_direccion?: string
  funcionamiento_hora_apertura?: string
  funcionamiento_hora_cierre?: string
  local_telefono?: string
  local_lat?: string
  local_lng?: string
}

interface FarmaciaRequestResult {
  data: FarmaciaApiResponse[]
  failed: boolean
}

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
    const normalizedComuna = this.normalizeText(comuna)

    return forkJoin({
      turnos: this.fetchFarmacias(this.buildTimestampedUrl(environment.apiTurnosUrl)),
      locales: this.fetchFarmacias(this.buildTimestampedUrl(environment.apiLocalesUrl)),
    }).pipe(
      switchMap(({ turnos, locales }) => {
        if (turnos.failed && locales.failed) {
          return throwError(() => new Error('No se pudo consultar la informacion de farmacias'))
        }

        const farmacias = this.mergeFarmacias(locales.data, turnos.data, normalizedComuna)
        return this.resolveCoordinatesByAddress(farmacias, normalizedComuna)
      })
    )
  }

  private fetchFarmacias(url: string): Observable<FarmaciaRequestResult> {
    return this.http.get<FarmaciaApiResponse[]>(url).pipe(
      map((data) => {
        if (!Array.isArray(data)) {
          console.error('Respuesta inesperada del proxy:', data)
          return {
            data: [],
            failed: true,
          }
        }

        return {
          data,
          failed: false,
        }
      }),
      catchError(() =>
        of({
          data: [],
          failed: true,
        })
      )
    )
  }

  private mergeFarmacias(locales: FarmaciaApiResponse[], turnos: FarmaciaApiResponse[], normalizedComuna: string): Farmacia[] {
    const farmaciasById = new Map<string, Farmacia>()

    this.filterByComuna(locales, normalizedComuna).forEach((item) => {
      const farmacia = this.mapApiFarmacia(item, false)
      farmaciasById.set(farmacia.id, farmacia)
    })

    this.filterByComuna(turnos, normalizedComuna).forEach((item) => {
      const farmaciaTurno = this.mapApiFarmacia(item, true)
      const existing = farmaciasById.get(farmaciaTurno.id)

      if (existing) {
        farmaciasById.set(farmaciaTurno.id, {
          ...existing,
          nombre: existing.nombre || farmaciaTurno.nombre,
          comuna: existing.comuna || farmaciaTurno.comuna,
          localidad: existing.localidad || farmaciaTurno.localidad,
          direccion: existing.direccion || farmaciaTurno.direccion,
          telefono: existing.telefono || farmaciaTurno.telefono,
          horario: existing.horario || farmaciaTurno.horario,
          horaApertura: existing.horaApertura || farmaciaTurno.horaApertura,
          horaCierre: existing.horaCierre || farmaciaTurno.horaCierre,
          lat: existing.lat ?? farmaciaTurno.lat,
          lng: existing.lng ?? farmaciaTurno.lng,
          esDeTurno: true,
          estaAbierta: existing.estaAbierta || farmaciaTurno.estaAbierta,
        })
        return
      }

      farmaciasById.set(farmaciaTurno.id, farmaciaTurno)
    })

    return Array.from(farmaciasById.values()).sort((a, b) => this.compareFarmacias(a, b))
  }

  private filterByComuna(data: FarmaciaApiResponse[], normalizedComuna: string): FarmaciaApiResponse[] {
    return data.filter((item) => this.normalizeText(item.comuna_nombre || '') === normalizedComuna)
  }

  private mapApiFarmacia(item: FarmaciaApiResponse, esDeTurno: boolean): Farmacia {
    const coordinates = this.normalizeCoordinates(item.local_lat, item.local_lng)
    const horaApertura = String(item.funcionamiento_hora_apertura || '').trim()
    const horaCierre = String(item.funcionamiento_hora_cierre || '').trim()
    const fallbackId = `${item.local_nombre || ''}-${item.local_direccion || ''}`.trim()

    return {
      id: String(item.local_id || fallbackId),
      nombre: String(item.local_nombre || '').trim(),
      comuna: String(item.comuna_nombre || '').trim(),
      localidad: String(item.localidad_nombre || '').trim(),
      direccion: String(item.local_direccion || '').trim(),
      telefono: this.normalizePhone(item.local_telefono),
      horario: this.buildHorario(horaApertura, horaCierre),
      horaApertura,
      horaCierre,
      esDeTurno,
      estaAbierta: this.isOpenAtCurrentTime(horaApertura, horaCierre),
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
    }
  }

  private buildHorario(apertura: string, cierre: string): string {
    const a = (apertura || '').trim()
    const c = (cierre || '').trim()

    if (a === '00:00:00' && c === '00:00:00') {
      return '24 horas'
    }

    if (a && c) return `${a} - ${c}`
    if (a || c) return a || c
    return ''
  }

  private normalizeText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  }

  private normalizePhone(value: unknown): string {
    const phone = String(value || '').trim()

    if (phone === '+56' || phone === '+560') {
      return ''
    }

    return phone
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

    const parsed = Number(String(value).trim().replace(',', '.').replace(/,+$/, ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  private isWithinChile(lat: number, lng: number): boolean {
    return lat >= -56 && lat <= -17 && lng >= -76 && lng <= -66
  }

  private isWithinWorld(lat: number, lng: number): boolean {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  }

  private buildTimestampedUrl(baseUrl: string): string {
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}t=${Date.now()}`
  }

  private getCurrentMinutesInChile(): number {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(new Date())
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

    return (hour * 60) + minute
  }

  private toMinutes(time: string): number | null {
    const match = String(time || '').trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
    if (!match) {
      return null
    }

    const hours = Number(match[1])
    const minutes = Number(match[2])

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null
    }

    return (hours * 60) + minutes
  }

  private isOpenAtCurrentTime(apertura: string, cierre: string): boolean {
    const openingMinutes = this.toMinutes(apertura)
    const closingMinutes = this.toMinutes(cierre)

    if (openingMinutes === null || closingMinutes === null) {
      return false
    }

    if (openingMinutes === 0 && closingMinutes === 0) {
      return true
    }

    const currentMinutes = this.getCurrentMinutesInChile()

    if (closingMinutes < openingMinutes) {
      return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes
    }

    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes
  }

  private compareFarmacias(a: Farmacia, b: Farmacia): number {
    if (a.esDeTurno !== b.esDeTurno) {
      return a.esDeTurno ? -1 : 1
    }

    if (a.estaAbierta !== b.estaAbierta) {
      return a.estaAbierta ? -1 : 1
    }

    return a.nombre.localeCompare(b.nombre, 'es')
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
    if (farmacia.lat !== null && farmacia.lng !== null) {
      return of(farmacia)
    }

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
        timeout(2500),
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
