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

let digiKeyTokenCache = { accessToken: '', expiresAt: 0, clientId: '' };

async function digikeyToken(clientId, clientSecret) {
  if (digiKeyTokenCache.accessToken && digiKeyTokenCache.clientId === clientId && Date.now() < digiKeyTokenCache.expiresAt) return digiKeyTokenCache.accessToken;
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
  const token = data?.access_token || '';
  const expiresIn = Number(data?.expires_in || 0);
  if (token) digiKeyTokenCache = { accessToken: token, clientId, expiresAt: Date.now() + Math.max(30, expiresIn - 30) * 1000 };
  return token;
}

export async function lookupDigiKeyExact({ partNumber, expectedManufacturer = '', manufacturerId = '', clientId, clientSecret }) {
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

  const returnedManufacturer = clean(product.Manufacturer?.Name || '');
  const normalizeManufacturer = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (expectedManufacturer && normalizeManufacturer(returnedManufacturer) !== normalizeManufacturer(expectedManufacturer)) {
    return {
      status: 'rejected',
      source_key: 'digikey_product_information_v4',
      result_code: 'manufacturer_mismatch',
      returned_part_number: returnedPn,
      returned_manufacturer: returnedManufacturer
    };
  }

  const imageUrl = clean(product.PhotoUrl || product.PrimaryPhoto || '');
  return {
    status: imageUrl ? 'verified_candidate' : 'not_found',
    source_key: 'digikey_product_information_v4',
    part_number: returnedPn,
    manufacturer: returnedManufacturer,
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
      expectedManufacturer: secrets?.expectedManufacturer || '',
      manufacturerId,
      clientId: clean(secrets?.digikeyClientId),
      clientSecret: clean(secrets?.digikeyClientSecret)
    });
  }

  return { status: 'unsupported_source', source_key: key, error: 'adapter_not_implemented' };
}
