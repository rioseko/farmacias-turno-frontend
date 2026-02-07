export const environment = {
  production: true,
  // Usamos un proxy CORS público para evitar problemas de CORS y volver a la URL original solicitada
  apiUrl: 'https://corsproxy.io/?' + encodeURIComponent('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php')
};
