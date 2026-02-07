import { Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { environment } from '../../environments/environment'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Farmacia } from '../models/farmacia'

interface ApiResponse {
  ok: boolean
  total: number
  comuna: string
  data: Farmacia[]
}

@Injectable({
  providedIn: 'root',
})
export class FarmaciasService {
  constructor(private http: HttpClient) {}

  getFarmacias(comuna: string): Observable<Farmacia[]> {
    const params = new HttpParams()
      .set('comuna', comuna)
      .set('_', String(Date.now()))
    return this.http
      .get<ApiResponse>(`${environment.backendUrl}/api/farmacias`, { params })
      .pipe(map((res) => res.data ?? []))
  }
}
