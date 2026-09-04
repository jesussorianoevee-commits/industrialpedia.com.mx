# Industrialpedia — Registro de endpoints

## Regla raíz

**Un contrato canónico, un nombre estable, un solo registro.**

No crear `v18`, `v19`, etc. para corregir comportamiento del buscador. Las mejoras compatibles se realizan sobre el endpoint canónico; un cambio incompatible requiere una decisión documentada y migración explícita de consumidores.

## Canónicos actuales

| Contrato | Endpoint | Consumidores | Estado |
|---|---|---|---|
| Search | `industrialpedia-search-v17` | `supabaseIndustrialpediaApi.js` | CANÓNICO |
| Catalog stats | `industrialpedia-catalog-stats` | `supabaseIndustrialpediaApi.js` | CANÓNICO |
| Structured acquisition | `industrialpedia-structured-acquisition-v1` | `EjecutarAdquisicionOficial` | CANÓNICO |

## Versiones históricas detectadas en Supabase

Se verificaron funciones remotas activas con nombres/versiones anteriores o paralelos, incluyendo:

- `industrialpedia-search-v13`
- `industrialpedia-search-v14`
- `industrialpedia-search-v15`
- `industrialpedia-search-v16`

Estas funciones **no se consideran consumidores de la aplicación** solo por existir. Permanecen hasta completar inventario de consumidores, automatizaciones y dependencias.

## Protocolo de retiro

Antes de retirar una función histórica:

1. Buscar referencias en frontend y backend.
2. Inventariar automatizaciones y jobs.
3. Comparar comportamiento contra el contrato canónico.
4. Confirmar que ningún flujo externo depende de ella.
5. Crear checkpoint.
6. Retirar una función a la vez.
7. Ejecutar las pruebas y una prueba real del endpoint canónico.
8. Documentar resultado y reversión.

Este protocolo evita que una limpieza técnica destruya trazabilidad o rompa procesos ocultos.
