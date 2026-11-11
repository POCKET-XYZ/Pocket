# Logo de Pocket

La P con la moneda entrando en la ranura. En el logo, esa P es la primera letra de “Pocket”.

## Qué usar en cada caso

| Uso | Archivo |
|---|---|
| Logo sobre fondo claro | `svg/logo-navy.svg` |
| Logo sobre fondo oscuro | `svg/logo-white.svg` |
| Logo en tamaño chico (menos de unos 120 px de ancho) | `svg/logo-navy-chico.svg`, `svg/logo-white-chico.svg`, con la moneda más grande |
| Logo en un solo color | `svg/logo-mono-navy.svg`, `svg/logo-mono-white.svg` |
| Símbolo solo | `svg/symbol-navy.svg`, `svg/symbol-white.svg`, `svg/symbol-celeste-on-navy.svg` |
| Símbolo en un solo color | `svg/symbol-mono-navy.svg`, `svg/symbol-mono-white.svg` |
| Favicon | `favicon.ico`, `svg/favicon.svg`, `png/favicon-16.png` a `png/favicon-48.png` |
| Foto de perfil | `redes/perfil/perfil-plano-1080.png` (o `perfil-3d-1080.png`) |
| Foto de perfil con Pocket completo | `redes/perfil/perfil-logo-completo-1080.png` |
| Ícono de app | `3d/app-icon-3d-1024.png`, `-512`, `-180` |
| 3D con fondo liso | `3d/p-3d-navy-2048.png` (fondo navy), `3d/p-3d-light-2048.png` (fondo claro) |
| Ícono de app plano | `svg/app-icon.svg`, `png/app-icon-flat-1024.png`, `-512` |
| Landing, decks y redes | `3d/p-3d-navy-transparent.png`, `3d/p-3d-celeste-transparent.png` |

Los íconos de app son cuadrados, sin esquinas redondeadas: iOS y Android aplican su propia máscara.

## Redes

La misma foto de perfil sirve en todas las redes: cada una la achica y la recorta sola.

| Archivo en `redes/portadas/` | Dónde va | Cuidado |
|---|---|---|
| `x-header-1500x500.png` | Encabezado de X | X puede recortar 60 px arriba y abajo |
| `linkedin-portada-1512x256.png` | Portada de la página de empresa | El logo de la empresa tapa parte de la esquina inferior izquierda |
| `youtube-banner-2560x1440.png` | Banner del canal | En celular solo se ve la franja central de 1546 x 423 px |

## Web

Copia el contenido de `web/` a la carpeta pública del sitio y agrega esto al `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:image" content="https://TU-DOMINIO/og-image-1200x630.png">
```

`og-image-1200x630.png` es la imagen que aparece al compartir el link. Va con la URL completa del sitio.

## Posts

Cada plantilla de `posts/plantillas/` viene en navy y en claro. `anuncio-*` se publica tal cual. `base-*` trae el logo y deja el espacio libre para tu contenido.

| Formato | Medida | Dónde |
|---|---|---|
| `vertical` | 1080 x 1350 | Feed de Instagram y LinkedIn. Es el que ocupa más pantalla en el celular |
| `cuadrado` | 1080 x 1080 | Feed de cualquier red |
| `historia` | 1080 x 1920 | Historias, Reels y TikTok. Deja libres unos 250 px arriba y abajo |
| `horizontal` | 1200 x 627 | LinkedIn y X con imagen ancha |

En el perfil de Instagram los posts se muestran en 3:4, así que el `vertical` pierde unos 34 px a cada lado.

`posts/marca-de-agua/` tiene el logo y el símbolo sin fondo para poner sobre fotos o piezas tuyas.

## Reglas

- Usa el 3D desde unos 64 px hacia arriba. Por debajo, usa la versión plana.
- P navy sobre fondos claros; P blanca o celeste sobre navy.
- La moneda siempre es amarilla `#FFD23F`, salvo en las versiones de un solo color. El amarillo se usa solo ahí.
- Las letras “ocket” son Figtree ExtraBold convertida a curvas: no hace falta instalar la fuente para usar el logo.
- No pongas el símbolo al lado del logo: la P ya está dentro de la palabra.

## Colores

| Color | Código | Uso |
|---|---|---|
| Navy | `#0F2E52` | Color principal, fondos y texto sobre fondos claros |
| Mandarina | `#FF9F45` | Contraste: datos grandes y detalles. No para texto chico |
| Amarillo | `#FFD23F` | Solo la moneda del logo |
| Jeans | `#355C86` (aproximado) | Apoyo |
| Acero | `#6C8295` (aproximado) | Apoyo, sin texto chico encima |
| Celeste | `#86D4E6` | La P en 3D sobre navy |
| Off-white | `#F4FBFD` | Fondos claros y texto sobre navy |

## Tipografías

| Uso | Letra | Peso |
|---|---|---|
| Títulos | Figtree | Bold o ExtraBold |
| Datos grandes en posts y decks | Anton | Regular |
| Párrafos, botones y etiquetas | Inter | Regular o Medium |

Las tres son gratuitas y están en Google Fonts. El texto chico va desde 14 px, en navy sobre fondo claro o en blanco sobre navy.

## Otras carpetas

- `3d/source-p-3d.html`: el modelo 3D. Abrirlo con `?shape=pone&bg=navy` lo vuelve a generar.
- `build/`: los scripts que generan el logo y el kit.
- `archivo/`: versiones y propuestas descartadas. `archivo/set-fredoka/` tiene el logo y las piezas anteriores.
