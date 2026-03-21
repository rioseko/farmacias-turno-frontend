export const environment = {
  production: false,
  googleMapsApiKey: '',
  googleMapsMapId: '',
  // En local usamos el proxy configurado en proxy.conf.json.
  // Las peticiones a /farmacia_v2/... se redirigen a https://midas.minsal.cl/farmacia_v2/...
  apiTurnosUrl: '/farmacia_v2/WS/getLocalesTurnos.php',
  apiLocalesUrl: '/farmacia_v2/WS/getLocales.php',
}
