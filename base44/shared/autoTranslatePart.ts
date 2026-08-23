const LANGUAGES = ['es', 'en', 'de', 'fr', 'zh'];

function cleanText(value: unknown, max = 2000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sameText(a: string, b: string) {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase();
}

const MARKETPLACE_NOISE = /\b(?:custom|new|hot|sale|best|free\s+shipping|fast\s+shipping|in\s+stock|wholesale|cheap|high\s+quality|100%\s+brand\s+new|promotion|promo|for\s+sale)\b/gi;

function normalizePresentationName(value: unknown, fallback = '') {
  const cleaned = cleanText(value)
    .replace(MARKETPLACE_NOISE, ' ')
    .replace(/[|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || cleanText(fallback);
}

function containsPartIdentifier(name: string, partNumber: string) {
  const identifier = cleanText(partNumber).toLowerCase();
  return Boolean(identifier) && cleanText(name).toLowerCase().includes(identifier);
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
  const sourceManufacturer = cleanText(part.manufacturer_name || part.manufacturer || '');
  const sourcePartNumber = cleanText(part.part_number || '');
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
        'Translate the product name, product description, category, subcategory and specification attribute labels into the requested languages.',
        'The product name is a presentation title, not a raw marketplace listing. Normalize it into a concise technical product name in each target language. Prefer the technical product type plus meaningful technical differentiators.',
        'Do not copy generic marketplace adjectives such as CUSTOM, NEW, HOT, SALE, BEST, FREE SHIPPING or seller boilerplate into the technical product name unless they are part of a verified manufacturer or model identifier.',
        'Do not invent or guess a manufacturer. If the manufacturer is unknown, omit it from the presentation name.',
        'Avoid repeating the same model/part number in the name when it is already available as a separate identifier. The visible title must not become empty after removing an identifier; preserve the exact identifier in the identifier fields.',
        'Preserve exact technical identifiers, verified manufacturer names, model numbers, part numbers, standards, material grades, dimensions, units, voltages, currents, pressures, ratings and alphanumeric codes exactly as written.',
        'For specification values, translate only human-language text when necessary; never translate numbers, units, codes, dimensions or alphanumeric identifiers.',
        'Do not invent specifications. Do not add information that is absent from the source.',
        'Use concise terminology appropriate for industrial maintenance, automation and MRO catalogs.',
        `Verified manufacturer: ${sourceManufacturer || '[unknown]'}`,
        `Part/model identifier: ${sourcePartNumber || '[unknown]'}`,
        `Raw source name: ${sourceName}`,
        `Source description: ${sourceDescription}`,
        `Source category: ${sourceCategory}`,
        `Source subcategory: ${sourceSubcategory}`,
        `Source specifications JSON: ${JSON.stringify(sourceSpecifications)}`,
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
                description: { type: 'string' },
                category: { type: 'string' },
                subcategory: { type: 'string' },
                specifications: { type: 'object' }
              },
              required: ['language', 'name', 'description', 'category', 'subcategory', 'specifications']
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
      // Defensive normalization: the LLM is instructed to produce a technical
      // title, but marketplace boilerplate is removed again deterministically.
      // The canonical source remains untouched and identifiers are never altered.
      let name = normalizePresentationName(item.name, sourceName);
      if (sourcePartNumber && containsPartIdentifier(name, sourcePartNumber)) {
        const withoutIdentifier = cleanText(name.replace(new RegExp(sourcePartNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ''));
        if (withoutIdentifier) name = withoutIdentifier;
      }
      const description = cleanText(item.description || sourceDescription);
      const category = cleanText(item.category || sourceCategory);
      const subcategory = cleanText(item.subcategory || sourceSubcategory);
      const specifications = item.specifications && typeof item.specifications === 'object' && !Array.isArray(item.specifications)
        ? item.specifications
        : {};
      // Guard against an accidental empty output. The canonical Part remains
      // untouched; this is presentation-only content.
      if (!name) continue;
      records.push({
        part_id: part.id,
        language,
        name,
        description,
        category,
        subcategory,
        specifications,
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
