export const environment = {
  production: false,
  // En local usamos el proxy configurado en proxy.conf.json
  // La petición a /farmacia_v2/... será redirigida a https://midas.minsal.cl/farmacia_v2/...
  apiUrl: '/farmacia_v2/WS/getLocalesTurnos.php'
};
