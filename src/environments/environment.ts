export const environment = {
  production: false,
  googleMapsApiKey: '',
  googleMapsMapId: '',
  // En local usamos el proxy configurado en proxy.conf.json
  // La peticion a /farmacia_v2/... sera redirigida a https://midas.minsal.cl/farmacia_v2/...
  apiUrl: '/farmacia_v2/WS/getLocalesTurnos.php',
}
