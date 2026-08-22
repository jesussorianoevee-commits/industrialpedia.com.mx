const LANGUAGES = ['es', 'en', 'de', 'fr', 'zh'];

function cleanText(value: unknown, max = 2000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sameText(a: string, b: string) {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase();
}

/**
 * Automatically creates the multilingual presentation layer for a new Part.
 * The Part record remains authoritative: identifiers, manufacturer, specs and
 * evidence are never sent as translatable fields and are never modified here.
 * Translation records start as machine_draft and can later be reviewed/published.
 */
export async function autoTranslatePart(base44: any, part: any) {
  if (!part?.id) return { created: 0, skipped: 0, failed: 0 };

  const sourceName = cleanText(part.name || part.product_name || part.description || part.part_number);
  const sourceDescription = cleanText(part.description || part.name || '');
  const sourceCategory = cleanText(part.category || '');
  const sourceSubcategory = cleanText(part.subcategory || '');
  const sourceSpecifications = part.specifications && typeof part.specifications === 'object' && !Array.isArray(part.specifications)
    ? Object.fromEntries(Object.entries(part.specifications).slice(0, 40))
    : {};
  if (!sourceName) return { created: 0, skipped: 0, failed: 0 };

  const existing = await base44.asServiceRole.entities.PartTranslation.filter(
    { part_id: part.id }, '-updated_date', 20
  ).catch(() => []);
  const existingByLanguage = new Map(existing.map((t: any) => [t.language, t]));
  const missingLanguages = LANGUAGES.filter((lang) => !existingByLanguage.has(lang));
  if (!missingLanguages.length) return { created: 0, skipped: existing.length, failed: 0 };

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: [
        'You are Industrialpedia technical terminology translator.',
        'Translate ONLY the product name and product description into the requested languages.',
        'Preserve exact technical identifiers, manufacturer names, model numbers, part numbers, standards, material grades, dimensions, units, voltages, currents, pressures, ratings and alphanumeric codes exactly as written.',
        'Do not invent specifications. Do not add information that is absent from the source.',
        'Use concise terminology appropriate for industrial maintenance, automation and MRO catalogs.',
        `Source name: ${sourceName}`,
        `Source description: ${sourceDescription}`,
        `Requested languages: ${missingLanguages.join(', ')}`
      ].join('\n'),
      response_json_schema: {
        type: 'object',
        properties: {
          source_language: { type: 'string', enum: LANGUAGES },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                language: { type: 'string', enum: LANGUAGES },
                name: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['language', 'name', 'description']
            }
          }
        },
        required: ['source_language', 'translations']
      }
    });

    const sourceLanguage = LANGUAGES.includes(result?.source_language) ? result.source_language : 'en';
    const translations = Array.isArray(result?.translations) ? result.translations : [];
    const records = [];
    for (const language of missingLanguages) {
      const item = translations.find((t: any) => t?.language === language);
      if (!item?.name) continue;
      const name = cleanText(item.name);
      const description = cleanText(item.description || sourceDescription);
      // Guard against an accidental empty/unchanged machine output for a language.
      if (!name) continue;
      records.push({
        part_id: part.id,
        language,
        name,
        description,
        status: 'machine_draft',
        source_language: sourceLanguage,
        translation_version: 1
      });
    }

    if (records.length) await base44.asServiceRole.entities.PartTranslation.bulkCreate(records);
    return { created: records.length, skipped: existing.length, failed: missingLanguages.length - records.length };
  } catch (error) {
    // Translation must never block or roll back a valid technical Part ingestion.
    console.error('autoTranslatePart failed:', error?.message || error);
    return { created: 0, skipped: existing.length, failed: missingLanguages.length };
  }
}
