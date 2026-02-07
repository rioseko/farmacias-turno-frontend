import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../environments/environment'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Farmacia } from '../models/farmacia'

@Injectable({
  providedIn: 'root',
})
export class FarmaciasService {
  constructor(private http: HttpClient) {}

  getFarmacias(comuna: string = 'temuco'): Observable<Farmacia[]> {
    const timestamp = new Date().getTime();
    
    return this.http.get<any[]>(`${environment.apiUrl}&t=${timestamp}`).pipe(
      map(data => {
        const normalizedComuna = comuna.trim().toLowerCase();
        
        // Verificamos si data es un array, si no lo es (ej. error del proxy), retornamos vacío
        if (!Array.isArray(data)) {
            console.error('Respuesta inesperada del proxy:', data);
            return [];
        }

        return data
          .filter(item => {
            const itemComuna = (item.comuna_nombre || '').trim().toLowerCase();
            return itemComuna === normalizedComuna;
          })
          .map(item => ({
            nombre: item.local_nombre || '',
            direccion: item.local_direccion || '',
            telefono: item.local_telefono || '',
            horario: this.buildHorario(item.funcionamiento_hora_apertura, item.funcionamiento_hora_cierre),
            lat: item.local_lat ? Number(item.local_lat) : 0,
            lng: item.local_lng ? Number(item.local_lng) : 0
          }));
      })
    );
  }

  private buildHorario(apertura: string, cierre: string): string {
    const a = (apertura || '').trim();
    const c = (cierre || '').trim();
    if (a && c) return `${a} – ${c}`;
    if (a || c) return a || c;
    return '';
  }
}
