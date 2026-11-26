# ESKALA · servicio de tarjetas de presentacion

Preparado para desplegar en Cloudflare Workers. Aun NO esta activo y NO debe sustituir al enlace actual hasta verificar la URL publica real.

- `GET /p/<identificador>/` genera HTML Open Graph en el servidor, con titulo y descripcion especificos
- `GET /i/<identificador>.jpg` sirve una portada JPG propia en el mismo dominio
- `GET /health` confirma disponibilidad
- Solo muestra disenos activos en `distribucion.json`
- Al abrir desde un navegador lleva automaticamente al visor original de GitHub Pages, sin modificar los modelos

Para activar: publicar el Worker desde una cuenta Cloudflare con Wrangler o conexion GitHub, comprobar la respuesta externa con cabecera `WhatsApp/2.x`, probar un enlace nuevo en WhatsApp y SOLO despues actualizar `FusionDistribution.share()` para usar ese dominio. Nada se publica a Cloudflare sin autorizacion de acceso. El enlace GitHub Pages sigue siendo la alternativa.

## Conexion por una sola vez (Cloudflare)

1. En **Workers & Pages** -> **Create application** -> **GitHub**, autoriza la conexion.
2. Selecciona el repositorio `romanfreebiker/fusion-vr-studio`, rama `main`.
3. Configura **Root directory** como `cloudflare-share`; nombre del Worker `eskala-share`.
4. Usa **Deploy command** `npx wrangler deploy`, sin Build command adicional.
5. Comprueba la ruta `/health` del dominio `workers.dev` que Cloudflare indique.

Cloudflare no publica automaticamente por el mero hecho de subir codigo a GitHub: esta vinculacion es imprescindible. Una vez confirmado el dominio, actualizar el enlace preferido en `distribucion.js` para crear automaticamente un unico enlace por proyecto y conservar `p/` de GitHub como respaldo.

No introducir tokens ni contrasenas en GitHub ni en el chat.
