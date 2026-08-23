import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { lookupImageByConfiguredSource } from '../../shared/imageApiSources.js';

// Adquisición de imágenes exclusivamente mediante APIs registradas.
// 0 IA, 0 buscador web, 0 scraping. Solo exact_part_number.

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const partId = String(body.part_id || '').trim();
    const partNumberInput = String(body.part_number || '').trim();
    const manufacturerHint = String(body.manufacturer_hint || '').trim();
    const sourceKey = String(body.source_key || 'digikey_product_information_v4').trim();

    if (!partId && !partNumberInput) return Response.json({ error: 'part_id or part_number required' }, { status: 400 });

    let partNumber = partNumberInput;
    // When the caller is using a canonical Knowledge Core id, that id is not a
    // Base44 Part id. A verified manufacturer hint lets the exact lookup still
    // enforce manufacturer + part-number identity without guessing.
    let manufacturer = manufacturerHint;
    if (partId) {
      const parts = await base44.asServiceRole.entities.Part.filter({ id: partId }, '-updated_date', 1);
      if (!parts.length) return Response.json({ error: 'part_not_found' }, { status: 404 });
      partNumber = String(parts[0].part_number || '').trim();
      manufacturer = String(parts[0].manufacturer_name || manufacturerHint || '').trim();
    }
    if (!partNumber) return Response.json({ error: 'part_number_missing' }, { status: 400 });

    const result = await lookupImageByConfiguredSource({
      sourceKey,
      partNumber,
      secrets: {
        digikeyClientId: secrets.get('DIGIKEY_CLIENT_ID'),
        digikeyClientSecret: secrets.get('DIGIKEY_CLIENT_SECRET'),
        expectedManufacturer: manufacturer
      }
    });

    return Response.json({
      part_id: partId || null,
      part_number: partNumber,
      manufacturer,
      source: sourceKey,
      deterministic: true,
      ai_used: false,
      result
    });
  } catch (error: any) {
    return Response.json({
      error: error?.message || String(error),
      deterministic: true,
      ai_used: false
    }, { status: 500 });
  }
}
