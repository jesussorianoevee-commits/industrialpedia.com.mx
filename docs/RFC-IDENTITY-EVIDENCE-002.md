# RFC-IDENTITY-EVIDENCE-002

## Estado

`approved_for_shadow_implementation_only`

## Alcance

Contrato determinístico para representar evidencia de identidad de un número de parte.

No modifica `publish_part_v1`. No publica piezas. No cambia la política de promoción.

## Autoridad

La autoridad es el **vector de segmentos**. Cada segmento conserva:

- `segment_id`
- `token`
- `validity`: `literal | grammar | unknown`
- `semantics`: `resolved | constant_no_legend | unknown`
- `evidence_class`

El campo de clase de la pieza es un **resumen derivado**, nunca la fuente de verdad.

## Regla de composición

Todos los segmentos participan.

No existe una lista implícita de "segmentos críticos". El resumen de pieza es la clase permitida más débil presente en el vector.

Para una identidad mixta como `VQZ3521-5YZ1-02F-Q`, una ocurrencia literal del modelo base no convierte los demás segmentos en literales: si existen segmentos `grammar_validated`, el resumen es `grammar_validated`.

## Clases

### literal_occurrence

Requiere documento, edición, página y texto de evidencia.

### grammar_validated

Requiere identificador y versión de gramática, regla y documentos/ediciones que la respaldan.

La validez y la semántica son independientes. Un literal constante puede ser:

- `validity: grammar`
- `semantics: constant_no_legend`

### external_record

Está **defined_unverified**.

Su uso queda bloqueado hasta ejecutar el experimento especificado para distinguir:

1. registro completo;
2. decodificador;
3. registro de modelo base + decodificación de sufijos;
4. intérprete permisivo / resultado nulo.

La evidencia de esa prueba deberá conservar respuesta cruda, hash, timestamp y URL.

## Reglas cruzadas

El contrato exige constancia explícita de la capa cruzada.

- `evaluation_status: evaluated` requiere resultados con `rule_id` y estado.
- `evaluation_status: not_applicable` requiere razón explícita.
- Una regla con resultado `fail` rechaza el contrato.

Un vector completo no puede saltarse esta capa.

## Límites

Este RFC no convierte identidad válida en pieza publicable.

La política de integración con `publish_part_v1` sigue pendiente de decisión separada.
