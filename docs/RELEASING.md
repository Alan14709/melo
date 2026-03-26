# Releasing Melo (Linux)

Guia corta para preparar y publicar release de Melo de forma segura.

## 1) Verificacion tecnica minima

```bash
npm run test:syntax
```

Opcional recomendado:

```bash
npm run test
```

## 2) Generar artefactos Linux

```bash
npm run release:linux
```

Artefactos esperados en `dist-electron/`:

- `Melo-<version>.AppImage`
- `melo_<version>_amd64.deb`

## 3) Checklist de seguridad antes de publicar

- Confirmar que no hay secretos en el repo (`token`, `secret`, `api_key`, credenciales).
- Confirmar `.gitignore` cubre `.env`, `.env.*`, `dist/`, `dist-electron/`, `node_modules/`, logs y artifacts de test.
- Confirmar que logging verbose no esta activo por defecto.
- Confirmar que `package.json` no expone datos personales innecesarios.

## 4) Checklist QA rapido del .deb

- Instalacion limpia del `.deb`.
- App abre una sola instancia (single-instance).
- Tray/autostart/media keys/notificaciones funcionan.
- MPRIS muestra metadata correcta (sin track pegado al detener/pausar).

## 5) Publicacion

No subir binarios manualmente al repo.
Publicar via flujo de release/tag de GitHub con los artefactos generados.

## 6) CI y manejo de tags existentes

- El workflow de release se dispara con tags `v*`.
- Si el tag `v1.5.0` ya existe y se cambiaron reglas de CI, no reescribir historia ni borrar tags.
- Crear un nuevo tag (por ejemplo `v1.5.1`) para re-disparar el workflow:

```bash
git tag -a v1.5.1 -m "Melo v1.5.1"
git push origin v1.5.1
```
