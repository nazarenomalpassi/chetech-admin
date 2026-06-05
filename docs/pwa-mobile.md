# PWA y mobile CheTech

## Que se agrego

- Manifest en `public/manifest.json`.
- Service worker en `public/sw.js`.
- Registro del service worker en `src/components/pwa/pwa-register.tsx`.
- Metadata PWA/iOS en `src/app/layout.tsx`.
- Iconos en `public/icons`.
- Favicon en `public/favicon.ico`.
- Navegacion mobile con menu desplegable en `src/components/layout/mobile-navigation.tsx`.
- Ajustes responsive globales en `src/app/globals.css`.

## Iconos

Los iconos actuales se generaron desde el isologo oficial:

- `MARCA/LOGO/WEB/CHETECH_ISOLOGO-WHITE.svg`
- El archivo vino del ZIP de marca `MARCA-20260605T224326Z-3-001.zip`.

Los iconos finales estan en:

- `public/icons/icon-72x72.png`
- `public/icons/icon-96x96.png`
- `public/icons/icon-128x128.png`
- `public/icons/icon-144x144.png`
- `public/icons/icon-152x152.png`
- `public/icons/icon-180x180.png`
- `public/icons/icon-192x192.png`
- `public/icons/icon-384x384.png`
- `public/icons/icon-512x512.png`
- `public/icons/maskable-icon-192x192.png`
- `public/icons/maskable-icon-512x512.png`
- `public/icons/favicon-16x16.png`
- `public/icons/favicon-32x32.png`
- `public/favicon.ico`

Si queres reemplazarlos por otro diseno final, mantené los mismos nombres y tamaños.

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

## Si no ves el icono nuevo

Los celulares cachean mucho los iconos PWA. Si seguis viendo el icono viejo:

1. Borra el acceso anterior de la pantalla de inicio.
2. En Safari iPhone, cerra la pestana de CheTech.
3. Volve a entrar a `https://chetech-admin.vercel.app`.
4. Toca compartir y `Agregar a pantalla de inicio`.
5. En Android, desde Chrome, borra la app instalada o el acceso viejo y volve a usar `Instalar app`.

## Comandos utiles

```bash
npm test
npm run typecheck
npm run build
```

Antes de publicar cambios nuevos, correr esos tres comandos y probar el login y las pantallas principales en mobile.
