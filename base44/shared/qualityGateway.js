// Quality Gateway determinístico para la ingesta. Sin IA, sin relajación.
// Ciclo: PROCESSED -> VALIDATED -> PUBLISHED | REJECTED | INCOMPLETE.
// Persistido != validado: un registro sólo se PUBLISHED si pasa todas las reglas.

export function gatePart(rec) {
  const causes = [];
  if (!rec.part_number) causes.push('missing part_number');
  if (!rec.manufacturer_name) causes.push('missing manufacturer_name');
  if (causes.length) return { pass: false, state: 'rejected', causes };
  if (!rec.specs || rec.specs.length === 0) {
    return { pass: false, state: 'incomplete', causes: ['no specifications extracted from document'] };
  }
  // Toda spec a publicar debe tener original_value (evidence la respalda el llamador).
  const specIncomplete = rec.specs.filter((s) => !s.original_value);
  if (specIncomplete.length === rec.specs.length) {
    return { pass: false, state: 'incomplete', causes: ['all specifications lack original_value'] };
  }
  return { pass: true, state: 'published', causes: [] };
}

export function gateSpec(spec) {
  if (!spec.original_value) return { pass: false, state: 'incomplete', causes: ['empty original_value'] };
  return { pass: true, state: 'published', causes: [] };
}