# ESKALA · API Tablet Taller

Servicio mínimo para que la Tablet Taller pueda modificar asignaciones sin iniciar sesión en GitHub.

## Seguridad
- La Tablet se autentica con su clave de terminal de 48 caracteres.
- El Worker compara SHA-256 de esa clave con `taller.json`.
- El token de GitHub nunca se entrega al navegador; se guarda solo como secreto `GITHUB_TOKEN` del Worker.
- La API solo permite asignar, actualizar, quitar asignación y retirar trabajos.
- Los móviles de operarios no usan esta API.

## Despliegue
1. Crear Worker `eskala-taller-api` desde esta carpeta.
2. Añadir el secreto `GITHUB_TOKEN` con permiso Contents: read/write únicamente sobre `romanfreebiker/fusion-vr-studio`.
3. Desplegar y comprobar `/health`.
4. Copiar la URL pública del Worker en `taller-api.json` -> `baseUrl`.
5. La Tablet empezará a usar la API automáticamente sin volver a cambiar su enlace.

No poner el token GitHub en este repositorio.
