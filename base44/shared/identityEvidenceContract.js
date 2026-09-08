// RFC-IDENTITY-EVIDENCE-002 — contrato determinístico en modo sombra.
// No publica piezas ni modifica publish_part_v1.
// La autoridad es el vector de segmentos; identity_evidence_class es un resumen derivado.
// Todos los segmentos participan en el resumen: no existe el concepto implícito de
// "segmento crítico".

export const IDENTITY_EVIDENCE_CLASSES = Object.freeze([
  'literal_occurrence',
  'grammar_validated',
  'external_record'
]);

export const SEGMENT_VALIDITY = Object.freeze(['literal', 'grammar', 'unknown']);
export const SEGMENT_SEMANTICS = Object.freeze(['resolved', 'constant_no_legend', 'unknown']);

const CLASS_STRENGTH = Object.freeze({
  // Una ocurrencia literal demuestra directamente ese fragmento.
  literal_occurrence: 2,
  // Una gramática validada demuestra una configuración permitida, no una
  // ocurrencia comercial individual; por eso es el eslabón más débil permitido.
  grammar_validated: 1
  // external_record está definido pero bloqueado hasta una instancia verificada.
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positivePage(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1;
}

function pushMissing(errors, condition, code) {
  if (!condition) errors.push(code);
}

function validateLiteralOccurrence(segment, errors, prefix) {
  pushMissing(errors, nonEmptyString(segment.document_id), `${prefix}:literal_document_id_missing`);
  pushMissing(errors, nonEmptyString(segment.document_edition), `${prefix}:literal_document_edition_missing`);
  pushMissing(errors, positivePage(segment.page), `${prefix}:literal_page_missing`);
  pushMissing(errors, nonEmptyString(segment.evidence_text), `${prefix}:literal_evidence_text_missing`);
}

function validateGrammarValidated(segment, errors, prefix) {
  pushMissing(errors, nonEmptyString(segment.grammar_id), `${prefix}:grammar_id_missing`);
  pushMissing(errors, nonEmptyString(segment.grammar_version), `${prefix}:grammar_version_missing`);
  pushMissing(errors, nonEmptyString(segment.rule_id), `${prefix}:grammar_rule_id_missing`);
  pushMissing(
    errors,
    Array.isArray(segment.supporting_documents) && segment.supporting_documents.length > 0,
    `${prefix}:grammar_supporting_documents_missing`
  );

  if (Array.isArray(segment.supporting_documents)) {
    segment.supporting_documents.forEach((doc, index) => {
      pushMissing(errors, nonEmptyString(doc?.document_id), `${prefix}:grammar_document_${index}_id_missing`);
      pushMissing(errors, nonEmptyString(doc?.edition), `${prefix}:grammar_document_${index}_edition_missing`);
    });
  }
}

function validateCrossRules(crossRules, errors) {
  if (!crossRules || typeof crossRules !== 'object') {
    errors.push('cross_rules_missing');
    return;
  }

  const status = crossRules.evaluation_status;
  if (status === 'evaluated') {
    const results = Array.isArray(crossRules.results) ? crossRules.results : [];
    if (results.length === 0) {
      errors.push('cross_rules_evaluated_without_results');
      return;
    }

    const seen = new Set();
    for (const [index, result] of results.entries()) {
      const prefix = `cross_rule_${index}`;
      if (!nonEmptyString(result?.rule_id)) {
        errors.push(`${prefix}:rule_id_missing`);
        continue;
      }
      if (seen.has(result.rule_id)) errors.push(`${prefix}:duplicate_rule_id`);
      seen.add(result.rule_id);

      if (!['pass', 'fail', 'not_applicable'].includes(result?.status)) {
        errors.push(`${prefix}:invalid_status`);
      } else if (result.status === 'fail') {
        errors.push(`${prefix}:rule_failed:${result.rule_id}`);
      }
    }
    return;
  }

  if (status === 'not_applicable') {
    if (!nonEmptyString(crossRules.reason)) errors.push('cross_rules_not_applicable_reason_missing');
    return;
  }

  errors.push('cross_rules_evaluation_status_invalid');
}

export function deriveIdentityEvidenceSummary(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  // Conservador: la pieza hereda la clase más débil de TODOS sus segmentos.
  // El vector sigue siendo la autoridad; este valor solo es una conclusión barata.
  let weakest = null;
  let weakestStrength = Infinity;

  for (const segment of segments) {
    const strength = CLASS_STRENGTH[segment?.evidence_class];
    if (!Number.isFinite(strength)) return null;
    if (strength < weakestStrength) {
      weakestStrength = strength;
      weakest = segment.evidence_class;
    }
  }
  return weakest;
}

export function validateIdentityEvidenceContract(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { pass: false, errors: ['payload_missing'], summary: null };
  }

  pushMissing(errors, nonEmptyString(payload.part_number), 'part_number_missing');

  const segments = Array.isArray(payload.segments) ? payload.segments : null;
  if (!segments || segments.length === 0) {
    errors.push('segments_missing');
  } else {
    const ids = new Set();

    segments.forEach((segment, index) => {
      const prefix = `segment_${index}`;
      pushMissing(errors, nonEmptyString(segment?.segment_id), `${prefix}:segment_id_missing`);
      pushMissing(errors, nonEmptyString(segment?.token), `${prefix}:token_missing`);

      if (nonEmptyString(segment?.segment_id)) {
        if (ids.has(segment.segment_id)) errors.push(`${prefix}:duplicate_segment_id`);
        ids.add(segment.segment_id);
      }

      if (!SEGMENT_VALIDITY.includes(segment?.validity)) {
        errors.push(`${prefix}:validity_invalid`);
      }
      if (!SEGMENT_SEMANTICS.includes(segment?.semantics)) {
        errors.push(`${prefix}:semantics_invalid`);
      }
      if (!IDENTITY_EVIDENCE_CLASSES.includes(segment?.evidence_class)) {
        errors.push(`${prefix}:evidence_class_invalid`);
        return;
      }

      if (segment.evidence_class === 'external_record') {
        // RFC: clase definida, instancia aún no verificada. No puede entrar al
        // contrato hasta ejecutar y aprobar el experimento de cuatro casos.
        errors.push(`${prefix}:external_record_defined_unverified`);
        return;
      }

      if (segment.evidence_class === 'literal_occurrence') {
        validateLiteralOccurrence(segment, errors, prefix);
      }

      if (segment.evidence_class === 'grammar_validated') {
        validateGrammarValidated(segment, errors, prefix);
        if (segment.validity !== 'grammar') errors.push(`${prefix}:grammar_validity_mismatch`);
      }
    });
  }

  validateCrossRules(payload.cross_rules, errors);

  const summary = errors.length === 0 ? deriveIdentityEvidenceSummary(segments) : null;
  return {
    pass: errors.length === 0,
    errors,
    summary,
    segment_vector: Array.isArray(segments)
      ? segments.map((s) => ({
          segment_id: s.segment_id,
          token: s.token,
          validity: s.validity,
          semantics: s.semantics,
          evidence_class: s.evidence_class
        }))
      : []
  };
}