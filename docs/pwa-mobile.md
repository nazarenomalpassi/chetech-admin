# PWA y mobile CheTech

## Que se agrego

- Manifest en `public/manifest.json`.
- Service worker en `public/sw.js`.
- Registro del service worker en `src/components/pwa/pwa-register.tsx`.
- Metadata PWA/iOS en `src/app/layout.tsx`.
- Iconos en `public/icons`.
- Navegacion mobile con menu desplegable en `src/components/layout/mobile-navigation.tsx`.
- Ajustes responsive globales en `src/app/globals.css`.

## Iconos

Los iconos actuales estan en:

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/maskable-icon-192.png`
- `public/icons/maskable-icon-512.png`
- `public/icons/apple-touch-icon.png`

Si queres reemplazarlos por un diseno final, mantené los mismos nombres y tamaños.

## Como probar en Android

1. Abrir `https://chetech-admin.vercel.app` desde Chrome.
2. Iniciar sesion normalmente.
3. Abrir el menu de Chrome.
4. Tocar `Agregar a pantalla principal` o `Instalar app`.
5. Confirmar que aparezca como `CheTech`.
6. Abrir desde el icono y verificar que no se vea como una pestana comun.

## Como probar en iPhone

1. Abrir `https://chetech-admin.vercel.app` desde Safari.
2. Iniciar sesion normalmente.
3. Tocar compartir.
4. Elegir `Agregar a pantalla de inicio`.
5. Confirmar el nombre `CheTech`.
6. Abrir desde el icono y verificar que respete pantalla completa/safe area.

## Como verificar tecnicamente

- En Chrome desktop: DevTools > Application > Manifest.
- Verificar que `Display` sea `standalone`.
- Verificar que los iconos carguen sin 404.
- Verificar que `Service Workers` muestre `/sw.js`.
- Verificar que las rutas dinamicas, Supabase y datos de caja/ventas/reparaciones sigan viniendo de red.

## Cache seguro

El service worker cachea solamente recursos estaticos:

- `/icons/*`
- `/brand/*`
- `/_next/static/*`

No cachea paginas del panel, APIs, Supabase ni datos dinamicos. Esto evita ver ventas, caja, productos o reparaciones desactualizadas.

## Comandos utiles

```bash
npm test
npm run typecheck
npm run build
```

Antes de publicar cambios nuevos, correr esos tres comandos y probar el login y las pantallas principales en mobile.
