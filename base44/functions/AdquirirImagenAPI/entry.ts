import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { lookupImageByConfiguredSource } from '../../shared/imageApiSources.js';
import { selectBestImage } from '../../shared/imageResolver.js';

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
    const sourceUrl = String(body.source_url || '').trim();

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

    const apiResult = await lookupImageByConfiguredSource({
      sourceKey,
      partNumber,
      secrets: {
        digikeyClientId: secrets.get('DIGIKEY_CLIENT_ID'),
        digikeyClientSecret: secrets.get('DIGIKEY_CLIENT_SECRET'),
        expectedManufacturer: manufacturer
      }
    });

    // Segunda capa: solo inspecciona la URL canónica ya vinculada al producto.
    // No hace búsqueda web ni coincidencias aproximadas. Esto permite cubrir
    // fabricantes/catálogos que no existen en DigiKey sin inventar imágenes.
    let result = apiResult;
    if (!result?.image_url && /^https?:\/\//i.test(sourceUrl)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(sourceUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; IndustrialpediaImageResolver/1.0)',
            'Accept': 'text/html,application/xhtml+xml'
          },
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        const contentType = response.headers.get('content-type') || '';
        const html = response.ok && /text\/html|application\/xhtml\+xml/i.test(contentType)
          ? await response.text()
          : '';

        // La página debe demostrar la referencia exacta antes de aceptar una imagen.
        const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pageText = norm(html);
        const pnNorm = norm(partNumber);
        const mfNorm = norm(manufacturer);
        const hasPart = pnNorm.length >= 3 && pageText.includes(pnNorm);
        const hasManufacturer = !mfNorm || pageText.includes(mfNorm);

        if (html && hasPart && hasManufacturer) {
          const selected = selectBestImage({
            html,
            markdown: '',
            product_context: {
              source_url: response.url || sourceUrl,
              partNumber,
              manufacturer,
              query: `${manufacturer} ${partNumber}`.trim()
            }
          });
          if (selected?.image_url) {
            result = {
              status: 'verified_candidate',
              source_key: 'canonical_product_page',
              part_number: partNumber,
              manufacturer,
              image_url: selected.image_url,
              source_url: response.url || sourceUrl,
              match_type: 'exact_part_number_on_canonical_page',
              resolver_method: selected.method,
              confidence: selected.confidence
            };
          }
        }
      } catch {
        // El fallo de una fuente no genera una imagen ficticia.
      }
    }

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
