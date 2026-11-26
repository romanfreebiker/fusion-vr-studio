# ESKALA · servicio de tarjetas de presentacion

Preparado para desplegar en Cloudflare Workers. Aun NO esta activo y NO debe sustituir al enlace actual hasta verificar la URL publica real.

- `GET /p/<identificador>/` genera HTML Open Graph en el servidor, con titulo y descripcion especificos
- `GET /i/<identificador>.jpg` sirve una portada JPG propia en el mismo dominio
- `GET /health` confirma disponibilidad
- Solo muestra disenos activos en `distribucion.json`
- Al abrir desde un navegador lleva automaticamente al visor original de GitHub Pages, sin modificar los modelos

Para activar: publicar el Worker desde una cuenta Cloudflare con Wrangler o conexion GitHub, comprobar la respuesta externa con cabecera `WhatsApp/2.x`, probar un enlace nuevo en WhatsApp y SOLO despues actualizar `FusionDistribution.share()` para usar ese dominio. Nada se publica a Cloudflare sin autorizacion de acceso. El enlace GitHub Pages sigue siendo la alternativa.
