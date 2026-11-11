# Brand kit de Pocket

Pocket es la capa de growth para startups. La marca debe sentirse fácil, moderna, cercana y segura para ambos lados. No debe sonar a crypto ni a banco.

Esta es la fuente de verdad de la marca desde noviembre de 2026. Reemplaza a Fredoka y al amarillo como color de contraste general.

## Logo

El logo es la palabra Pocket, con la P redonda como primera letra y una media moneda amarilla dentro. "ocket" es Figtree ExtraBold convertida a curvas.

| Uso | Archivo en `brand/logo/` |
|---|---|
| Logo sobre fondo claro | `svg/logo-navy.svg` |
| Logo sobre navy | `svg/logo-white.svg` |
| Logo de menos de unos 120 px de ancho | `svg/logo-navy-chico.svg`, `svg/logo-white-chico.svg` |
| Un solo color | `svg/logo-mono-navy.svg`, `svg/logo-mono-white.svg` |
| P sola | `svg/symbol-navy.svg`, `svg/symbol-white.svg` |
| Foto de perfil de Instagram y otras redes | `redes/perfil/perfil-plano-1080.png` |
| Foto de perfil con Pocket completo | `redes/perfil/perfil-logo-completo-1080.png` |
| Favicon e íconos del sitio | `web/` |
| P en 3D, para piezas grandes | `3d/` |

Reglas:

- La P en 3D va sola, nunca pegada a "ocket". Úsala desde unos 64 px; por debajo, usa la plana.
- No pongas la P al lado del logo: ya está dentro de la palabra.
- No redibujes el logo con texto en vivo. Usa los archivos.
- La moneda siempre es amarilla, salvo en las versiones de un solo color.

## Colores

Los valores también están en `brand/tokens.css`.

| Color | Código | Uso |
|---|---|---|
| Navy | `#0F2E52` | Color principal: fondos, títulos, texto y botones primarios |
| Mandarina | `#FF9F45` | Contraste: datos grandes, detalles y botones de acento |
| Amarillo | `#FFD23F` | Solo la moneda del logo |
| Jeans | `#355C86` | Apoyo: fondos secundarios y gráficos |
| Acero | `#6C8295` | Apoyo: fondos y detalles, sin texto chico encima |
| Celeste | `#86D4E6` | P en 3D sobre navy y detalles |
| Celeste claro | `#B8E7F1` | Texto secundario sobre navy y fondos suaves |
| Off-white | `#F4FBFD` | Fondos claros y texto sobre navy |

Jeans y acero se tomaron a ojo de una imagen de referencia, así que se pueden afinar.

### Combinaciones medidas

Para texto chico se suele pedir al menos 4.5 : 1. Para texto grande y gráficos, 3 : 1.

| Combinación | Contraste | Sirve para |
|---|---|---|
| Blanco sobre navy | 13.7 : 1 | Todo |
| Navy sobre off-white | 13.1 : 1 | Todo |
| Mandarina sobre navy | 6.7 : 1 | Todo, aunque conviene reservarla para datos y detalles |
| Navy sobre mandarina | 6.7 : 1 | Botones de acento |
| Blanco sobre jeans | 6.9 : 1 | Todo |
| Blanco sobre acero | 4.0 : 1 | Solo títulos y texto grande |
| Mandarina sobre jeans | 3.4 : 1 | Solo datos grandes |
| Mandarina sobre blanco | 2.0 : 1 | Nunca para texto |
| Blanco sobre mandarina | 2.0 : 1 | Nunca para texto |

## Tipografías

Las tres son gratuitas y están en Google Fonts.

| Uso | Letra | Peso |
|---|---|---|
| Títulos | Figtree | 700 u 800 |
| Datos grandes | Anton | 400, su único peso |
| Párrafos, botones, formularios y etiquetas | Inter | 400 o 500 |

- El texto chico va desde 14 px. Solo baja a 12 px en notas legales o etiquetas muy cortas.
- Anton es para un dato o una palabra grande, nunca para párrafos ni para el logo.

## Posts

La fórmula es un dato grande en Anton y mandarina, una frase en Figtree, un texto corto en Inter y el logo abajo, sobre navy.

| Formato | Medida | Dónde |
|---|---|---|
| Vertical | 1080 x 1350 | Feed de Instagram y LinkedIn |
| Cuadrado | 1080 x 1080 | Feed de cualquier red |
| Historia | 1080 x 1920 | Historias, Reels y TikTok; deja libres unos 250 px arriba y abajo |
| Horizontal | 1200 x 627 | LinkedIn y X |

- Las plantillas están en `logo/posts/plantillas/`: `anuncio-*` se publica tal cual y `base-*` trae el espacio libre.
- El logo sin fondo para poner sobre fotos está en `logo/posts/marca-de-agua/`.
- Las portadas de X, LinkedIn y YouTube están en `logo/redes/portadas/`.

## Para actualizar la UI de la app

Estado actual de `apps/web`: `app/layout.tsx` carga Fredoka e Inter, y `app/globals.css` define `--font-heading` con Fredoka y un token `--yellow`.

1. Cambia Fredoka por Figtree (700 y 800) en `next/font/google`, y carga Anton solo si la pantalla muestra datos grandes.
2. Agrega los tokens de `brand/tokens.css` o adáptalos al sistema de la app.
3. Revisa cada uso de `yellow`. Como contraste, pasa a mandarina. Solo la moneda del logo sigue amarilla.
4. Botón primario: fondo navy y texto blanco. Botón de acento: fondo mandarina y texto navy.
5. Reemplaza el logo y el favicon por los archivos de `brand/logo/svg/` y `brand/logo/web/`.

Los colores de estado, como error, éxito y aviso, no se definieron aquí: conserva los que ya tenga la app y comprueba que no se confundan con la mandarina.
