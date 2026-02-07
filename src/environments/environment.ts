export const environment = {
  production: false,
  // En desarrollo también usamos el proxy para consistencia
  apiUrl: 'https://corsproxy.io/?' + encodeURIComponent('https://farmanet.minsal.cl/maps/index.php/ws/getLocalesRegion?id_region=9')
};
