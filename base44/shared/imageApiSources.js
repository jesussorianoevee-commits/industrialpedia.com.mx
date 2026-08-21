// Industrialpedia — fuentes API de imágenes determinísticas.
// 0 IA: solo consultas directas a APIs oficiales/autorizadas y coincidencia exacta
// del número de parte. Este módulo NO hace búsqueda web, scraping ni inferencia.

function clean(value) {
  return String(value || '').trim();
}

function normalizePartNumber(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error_description || data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function digikeyToken(clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });
  const data = await getJson('https://api.digikey.com/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  return data?.access_token || '';
}

export async function lookupDigiKeyExact({ partNumber, manufacturerId = '', clientId, clientSecret }) {
  const pn = clean(partNumber);
  if (!pn || !clientId || !clientSecret) return { status: 'not_configured', source_key: 'digikey_product_information_v4' };

  const token = await digikeyToken(clientId, clientSecret);
  if (!token) return { status: 'failed', source_key: 'digikey_product_information_v4', error: 'token_missing' };

  const encoded = encodeURIComponent(pn);
  const url = `https://api.digikey.com/products/v4/search/${encoded}/productdetails${manufacturerId ? `?manufacturerId=${encodeURIComponent(manufacturerId)}` : ''}`;
  const data = await getJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': clientId,
      'X-DIGIKEY-Locale-Site': 'MX',
      'X-DIGIKEY-Locale-Language': 'es',
      'X-DIGIKEY-Locale-Currency': 'MXN',
      Accept: 'application/json'
    }
  });

  const product = data?.Product || null;
  if (!product) return { status: 'not_found', source_key: 'digikey_product_information_v4' };

  const returnedPn = clean(product.ManufacturerProductNumber || product.DigiKeyProductNumber || '');
  if (normalizePartNumber(returnedPn) !== normalizePartNumber(pn)) {
    return {
      status: 'rejected',
      source_key: 'digikey_product_information_v4',
      result_code: 'part_number_mismatch',
      returned_part_number: returnedPn
    };
  }

  const imageUrl = clean(product.PhotoUrl || product.PrimaryPhoto || '');
  return {
    status: imageUrl ? 'verified_candidate' : 'not_found',
    source_key: 'digikey_product_information_v4',
    part_number: returnedPn,
    manufacturer: clean(product.Manufacturer?.Name || ''),
    image_url: imageUrl,
    source_url: clean(product.ProductUrl || ''),
    datasheet_url: clean(product.DatasheetUrl || ''),
    match_type: 'exact_part_number'
  };
}

export async function lookupImageByConfiguredSource({ sourceKey, partNumber, manufacturerId = '', secrets }) {
  const key = clean(sourceKey);
  if (key === 'digikey_product_information_v4') {
    return lookupDigiKeyExact({
      partNumber,
      manufacturerId,
      clientId: clean(secrets?.digikeyClientId),
      clientSecret: clean(secrets?.digikeyClientSecret)
    });
  }

  return { status: 'unsupported_source', source_key: key, error: 'adapter_not_implemented' };
}
