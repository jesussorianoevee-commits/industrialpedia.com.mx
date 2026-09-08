import assert from 'node:assert/strict';
import {
  deriveIdentityEvidenceSummary,
  validateIdentityEvidenceContract
} from '../shared/identityEvidenceContract.js';

const docs = [{ document_id: 'smc-vqz-eu', edition: 'CAT.EUS11-89A-UK' }];

function grammar(segment_id, token, rule_id, semantics = 'resolved') {
  return {
    segment_id,
    token,
    validity: 'grammar',
    semantics,
    evidence_class: 'grammar_validated',
    grammar_id: 'SMC_VQZ_5PORT',
    grammar_version: '1.0.0',
    rule_id,
    supporting_documents: docs
  };
}

function literal(segment_id, token, page = 530) {
  return {
    segment_id,
    token,
    validity: 'literal',
    semantics: 'resolved',
    evidence_class: 'literal_occurrence',
    document_id: 'smc-vqz-ja',
    document_edition: 'VQZ1000-2000-3000-JA',
    page,
    evidence_text: 'VQZ3521'
  };
}

function validPayload() {
  return {
    part_number: 'VQZ3521-5YZ1-02F-Q',
    segments: [
      literal('base_model', 'VQZ3521'),
      grammar('solenoid', '5', 'solenoid_5'),
      grammar('electrical', 'YZ', 'electrical_YZ'),
      {
        ...grammar('literal_constant', '1', 'literal_1', 'constant_no_legend'),
        semantics: 'constant_no_legend'
      },
      grammar('port', '02F', 'port_02_thread_F'),
      grammar('compliance', 'Q', 'suffix_Q')
    ],
    cross_rules: {
      evaluation_status: 'evaluated',
      results: [
        { rule_id: 'port_02_only_vqz3000', status: 'pass' },
        { rule_id: 'YZ_only_vqz2000_vqz3000', status: 'pass' },
        { rule_id: 'W_requires_rubber_and_not_external_pilot', status: 'not_applicable' }
      ]
    }
  };
}

const cases = [];

// 1) Mixto real: vector autoridad + resumen más débil.
{
  const result = validateIdentityEvidenceContract(validPayload());
  assert.equal(result.pass, true);
  assert.equal(result.summary, 'grammar_validated');
  assert.equal(result.segment_vector.find((s) => s.token === '1').semantics, 'constant_no_legend');
  cases.push('mixed_vector_passes');
}

// 2) Segmento sin evidencia.
{
  const payload = validPayload();
  delete payload.segments[1].supporting_documents;
  const result = validateIdentityEvidenceContract(payload);
  assert.equal(result.pass, false);
  assert.ok(result.errors.includes('segment_1:grammar_supporting_documents_missing'));
  cases.push('segment_without_evidence_rejected');
}

// 3) El caso estructural clave: todos los segmentos tienen evidencia,
// pero las reglas cruzadas no se ejecutaron.
{
  const payload = validPayload();
  payload.cross_rules = {};
  const result = validateIdentityEvidenceContract(payload);
  assert.equal(result.pass, false);
  assert.ok(result.errors.includes('cross_rules_evaluation_status_invalid'));
  cases.push('cross_rule_layer_cannot_be_skipped');
}

// 4) "No aplicaba ninguna" debe ser explícito, no un arreglo vacío ambiguo.
{
  const payload = validPayload();
  payload.cross_rules = {
    evaluation_status: 'not_applicable',
    reason: 'grammar declares no cross-segment constraints for this series'
  };
  const result = validateIdentityEvidenceContract(payload);
  assert.equal(result.pass, true);
  cases.push('cross_rule_not_applicable_is_explicit');
}

// 5) Regla cruzada evaluada y fallida: identidad rechazada aunque
// los segmentos individuales sean impecables.
{
  const payload = validPayload();
  payload.cross_rules.results = [{ rule_id: 'port_02_only_vqz3000', status: 'fail' }];
  const result = validateIdentityEvidenceContract(payload);
  assert.equal(result.pass, false);
  assert.ok(result.errors.includes('cross_rule_0:rule_failed:port_02_only_vqz3000'));
  cases.push('cross_rule_failure_rejected');
}

// 6) external_record sigue definido pero bloqueado.
{
  const payload = validPayload();
  payload.segments[0] = {
    ...payload.segments[0],
    evidence_class: 'external_record'
  };
  const result = validateIdentityEvidenceContract(payload);
  assert.equal(result.pass, false);
  assert.ok(result.errors.includes('segment_0:external_record_defined_unverified'));
  cases.push('external_record_blocked_until_experiment');
}

// 7) Todos los segmentos cuentan; no hay lista implícita de "críticos".
{
  assert.equal(
    deriveIdentityEvidenceSummary([
      literal('a', 'VQZ3521'),
      grammar('b', 'Q', 'suffix_Q')
    ]),
    'grammar_validated'
  );
  cases.push('all_segments_participate_in_summary');
}

console.log(JSON.stringify({
  status: 'IDENTITY_EVIDENCE_CONTRACT_SHADOW_OK',
  cases: cases.length,
  passed: cases
}, null, 2));