export const environment = {
  production: true,
  // Usamos un proxy CORS público para evitar problemas de CORS y bloqueo de IP de Netlify
  apiUrl: 'https://corsproxy.io/?' + encodeURIComponent('https://farmanet.minsal.cl/maps/index.php/ws/getLocalesRegion?id_region=9')
};
