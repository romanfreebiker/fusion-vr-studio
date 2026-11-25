# Distribución protegida de Fusion Studio

La interfaz publicada utiliza por defecto una demostración local con localStorage. No proporciona autenticación, privacidad ni sincronización entre equipos.

## Activación real
1. Crear un Worker de Cloudflare con el código de worker.js.
2. Crear una base D1 y vincularla como DB.
3. Crear un bucket R2 privado (sin acceso público ni dominio público), vinculado como MODELS.
4. Configurar APP_ORIGIN = https://romanfreebiker.github.io.
5. Configurar secretos ADMIN_SECRET y DIRECTOR_SECRET diferentes, aleatorios y de al menos 24 caracteres. Nunca ponerlos en GitHub.
6. Desplegar el Worker. Configurar su URL HTTPS en la constante api de distribucion.js y actualizar la versión del script en index.html, direccion.html y visor.html.
7. Probar administrador, dirección y visitante desde distintos navegadores; probar desactivación, revocación, acceso a otros IDs, acceso sin credenciales y CORS.

El Worker sincroniza estados y guarda una copia privada del GLB. La desactivación elimina los enlaces de invitado existentes, y la reactivación no los restaura. Las claves de roles se guardan temporalmente en sessionStorage. El usuario invitado recibe un token aleatorio individual.

## Antes de usar modelos confidenciales
La biblioteca original y sus GLB siguen publicados en GitHub público; proteger las copias de distribución no hace privados los originales. Migrar la central y su carga de modelos a almacenamiento privado y retirar los originales y sus copias del historial público (sin garantía de eliminar copias previas). No utilizar datos confidenciales hasta completar esa migración. La central actual protege las escrituras GitHub mediante su autorización existente, pero no el acceso de lectura a su interfaz ni catálogo. La autenticación completa de la central y migración del almacenamiento quedan pendientes. Los enlaces de visitante son portadores: cualquiera que los reciba puede abrirlos mientras estén activos; no impiden capturas o copias del contenido ya descargado.

No se ha ejecutado una prueba integral de despliegue. El límite de carga del Worker depende del plan y requiere revisión para GLB grandes.
