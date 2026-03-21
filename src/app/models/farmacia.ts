export interface Farmacia {
  id: string
  nombre: string
  comuna: string
  localidad: string
  direccion: string
  telefono: string
  horario: string
  horaApertura: string
  horaCierre: string
  esDeTurno: boolean
  estaAbierta: boolean
  lat: number | null
  lng: number | null
}
