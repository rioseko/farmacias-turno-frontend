import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'farmacia-de-turno-temuco',
    renderMode: RenderMode.Prerender
  }
];
