export const environment = {
  production: false,
  // En desarrollo, necesitamos la URL completa del backend desplegado o local
  // Si corres netlify dev localmente, sería http://localhost:8888/.netlify/functions/api/farmacias
  // Por ahora asumimos que queremos pegar al backend de producción o usar el path relativo si servimos el front desde el mismo origen
  apiUrl: '/.netlify/functions/api/farmacias'
};
