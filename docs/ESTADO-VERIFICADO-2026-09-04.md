# Industrialpedia — Estado verificado

**Fecha:** 2026-09-04
**Objetivo:** separar hechos actuales de contexto histórico y evitar que documentación antigua se trate como estado real.

## 1. Fuente de verdad operacional

La realidad operativa se determina por esta prioridad:

1. Evidencia directa del runtime/servicio.
2. Código actualmente versionado.
3. Pruebas reproducibles.
4. Documentación vigente.
5. Contexto histórico.

El documento maestro de contexto es un mapa; no sustituye la evidencia actual.

## 2. Aplicación Base44

- Aplicación verificada: `INDUSTRIALPEDIA`.
- App ID: `6a80d5c7f1e14be5e7a747b1`.
- El código actual contiene un cliente Supabase y tres funciones Base44 locales.
- El frontend no contiene referencias directas a versiones antiguas del endpoint de búsqueda.
- El endpoint de búsqueda usado por la aplicación está centralizado en `base44/shared/endpointRegistry.js`.

## 3. Supabase verificado

El proyecto Supabase `stwwywzuzbkyoecjujeh` contiene actualmente múltiples Edge Functions históricas y activas. Entre ellas existen `industrialpedia-search-v13`, `v14`, `v15`, `v16` y `v17`.

**Conclusión:** el problema de proliferación de endpoints existe en el servicio remoto, aunque el consumidor actual de la aplicación está consolidado en `industrialpedia-search-v17`.

No se eliminan funciones remotas automáticamente porque borrar una función activa sin demostrar todos sus consumidores puede romper automatizaciones, integraciones o herramientas históricas. La limpieza remota queda como operación controlada posterior a inventario de consumidores.

### Endpoint canónico de búsqueda

- `industrialpedia-search-v17` — **CANÓNICO para la aplicación**.
- Versión desplegada verificada: 10.
- `verify_jwt`: false; la función implementa una comprobación propia de `apikey` antes de atender operaciones.
- La función usa una clave de servidor interna para consultar el Knowledge Core; esa clave no se expone al navegador.

### Otros endpoints canónicos usados por la aplicación

- `industrialpedia-catalog-stats`.
- `industrialpedia-structured-acquisition-v1`.

Todos están registrados en `base44/shared/endpointRegistry.js`.

## 4. Base de datos actual

Consulta directa realizada sobre `public.parts`:

- `candidate`: 1,030 registros.
- `rejected`: 14,563 registros.
- Registros `published`: 0 según el campo de estado disponible actualmente; la tabla usa `status`, no `validation_state`.
- Los 1,030 candidatos no archivados tienen `source_url`.
- Los 1,030 candidatos no archivados tienen `manufacturer_id`.
- 996 de los 1,030 candidatos tienen un objeto `specifications` no vacío.
- `spec_property_definitions`: 91 definiciones.
- `part_evidence`: 78,310 registros.

**Interpretación:** existe evidencia y volumen de candidatos, pero el catálogo no debe presentarse como publicado/validado solo por la existencia de esos candidatos.

## 5. Protecciones ya incorporadas en código

### A. Registro único de endpoints

`base44/shared/endpointRegistry.js` concentra los endpoints canónicos. Los consumidores ya no deben escribir `industrialpedia-search-v17` manualmente.

### B. Gate de gobernanza

`base44/tests/governanceGate.mjs` verifica:

1. No usar versiones antiguas del buscador en consumidores.
2. Las URLs versionadas solo pueden vivir en el registro central.
3. No introducir SDK/gateway generativo de IA en producción.
4. No exponer claves service-role/secret en `src`.
5. Mantener `part_id` como identidad canónica del comparador.
6. Mantener una lista explícita de endpoints canónicos.

### C. Gate de calidad integrado

`npm run quality:gate` ahora ejecuta también `governance:gate`.

## 6. Qué NO se hizo deliberadamente

- No se borraron Edge Functions remotas antiguas.
- No se modificaron registros de productos.
- No se cambió el estado de candidatos a publicados.
- No se alteraron esquemas de base de datos.
- No se reintrodujo IA.
- No se sustituyó una implementación existente por otra sin evidencia.

Estas omisiones son deliberadas: son medidas de preservación de evidencia y reversibilidad.

## 7. Siguiente nivel de endurecimiento

La limpieza definitiva de funciones remotas antiguas requiere identificar sus consumidores reales y sus automatizaciones antes de retirar cada una. El código ya queda protegido contra volver a crear referencias nuevas dispersas; la eliminación remota debe hacerse como operación controlada y verificable.
