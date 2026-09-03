# RFC-CROSSREF-001 — Cross-Reference Determinístico Universal

## Objetivo
Convertir Industrialpedia en un motor de cross-reference industrial multi-fabricante y multi-familia, sin IA, reutilizando identidad, evidencia, normalización, comparación y Quality Gate existentes.

## Principios
1. Nunca inferir equivalencia sólo por similitud textual.
2. Nunca publicar una sustitución sin identidad demostrada y evidencia trazable.
3. Separar producto, relación técnica y oferta comercial.
4. Comparar propiedades normalizadas, no cadenas crudas.
5. Las reglas críticas dependen de la familia técnica.
6. `different`, `missing` y `not_comparable` nunca se deben presentar como equivalencia.
7. Todo resultado debe ser reproducible con versión de reglas.
8. Lo desconocido se conserva; nunca se descarta silenciosamente.
9. La IA queda fuera del pipeline de producción.

## Tipos de relación
- `exact_identity`: mismo producto/PN demostrado.
- `official_replacement`: fabricante declara reemplazo.
- `successor`: sucesor documental del producto.
- `equivalent`: evidencia/reglas demuestran equivalencia técnica dentro de una familia.
- `compatible`: funciona conjuntamente, pero no implica reemplazo.
- `similar`: comparte función/familia, sin evidencia suficiente para sustitución.

## Pipeline
`query -> discovery -> identity -> family -> candidate retrieval -> normalization -> family constraints -> comparison -> evidence -> quality gate -> relation -> decision`

## Candidate retrieval
La recuperación de candidatos debe ser amplia pero determinista: misma familia primero, después atributos funcionales y finalmente fabricante/lifecycle. La recuperación no decide equivalencia.

## Decision states
- `EXACT`: identidad exacta.
- `REPLACE`: sustitución demostrada.
- `EQUIVALENT`: equivalente técnico demostrado.
- `COMPATIBLE`: compatible pero no reemplazo.
- `SIMILAR_REVIEW`: parecido, requiere revisión.
- `NOT_SUBSTITUTABLE`: falla una condición crítica.
- `INSUFFICIENT_EVIDENCE`: faltan datos para decidir.

## Score
El score es auxiliar y nunca puede sobreescribir una regla crítica. La decisión final se basa en constraints y evidencia. Para evitar el problema de "80% similar", un candidato con fallo crítico queda fuera aunque tenga muchas coincidencias.

## Familias iniciales prioritarias
1. sensores/proximidad
2. neumática/cilindros
3. rodamientos
4. PLC/I/O
5. variadores/servos
6. motores
7. relés/contactores
8. fuentes
9. conectores
10. bombas

## Reutilización obligatoria
- `identityGuard` / resolución de identidad existente.
- `DemonstratedFact` / `Provenance` / `part_evidence`.
- normalización y conversiones existentes.
- `compare_part_candidates_v2` y `evaluate_substitution_v1` existentes.
- `publish_part_v1` como Quality Gate.

## No hacer en este RFC
No sustituir el buscador actual, no introducir embeddings, LLMs ni otro motor paralelo, no agregar CAD al MVP, no mezclar precios/ofertas con equivalencia técnica.

## Criterio de éxito
Una consulta descriptiva como `sensor inductivo 5 mm` debe recuperar candidatos de múltiples fabricantes cuando existan datos, normalizar sus atributos comparables y producir estados de decisión explicables, con cada diferencia crítica y su evidencia visible.
