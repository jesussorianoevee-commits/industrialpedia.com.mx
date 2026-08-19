// Valida que los campos de identidad (manufacturer_name, part_number) en un
// resultado estén respaldados por evidencia, no derivados de tokens de la
// consulta o términos genéricos del dominio industrial.
//
// Determinístico: sin IA, sin LLM, sin listas específicas de productos.
// Generalizable: las reglas se basan en categorías semánticas, no en palabras
// o fabricantes concretos.

// Términos genéricos del dominio industrial que NUNCA deben usarse como
// manufacturer_name: son categorías, componentes, conceptos o fragmentos
// de palabras técnicas, no fabricantes.
const GENERIC_MANUFACTURER_TERMS = new Set([
  // English — componentes y categorías
  'bearing', 'bearings', 'motor', 'motors', 'valve', 'valves',
  'sensor', 'sensors', 'cylinder', 'cylinders', 'connector', 'connectors',
  'cable', 'cables', 'relay', 'relays', 'contactor', 'contactors',
  'switch', 'switches', 'plc', 'controller', 'controllers',
  'drive', 'driver', 'drivers', 'inverter', 'inverters',
  'power', 'supply', 'supplies', 'module', 'modules',
  'pneumatic', 'electric', 'electrical', 'hydraulic',
  'industrial', 'automation', 'component', 'components',
  'catalog', 'catalogue', 'datasheet', 'specification', 'specifications',
  'part', 'parts', 'product', 'products', 'refaccion', 'refacciones',
  'repuesto', 'repuestos', 'replacement', 'replacements',
  // Spanish — componentes y categorías
  'balero', 'baleros', 'rodamiento', 'rodamientos', 'cojinete', 'cojinetes',
  'valvula', 'valvulas', 'válvula', 'válvulas',
  'sensor', 'sensores', 'cilindro', 'cilindros',
  'conector', 'conectores', 'cable', 'cables',
  'rele', 'reles', 'relé', 'relés', 'contactor', 'contactores',
  'interruptor', 'interruptores',
  'controlador', 'controladores',
  'fuente', 'fuentes', 'modulo', 'modulos', 'módulo', 'módulos',
  'neumatico', 'neumaticos', 'neumático', 'neumáticos',
  'electrico', 'electrica', 'eléctrico', 'eléctrica', 'electronico', 'electrónica',
  'hidraulico', 'hidraulica', 'hidráulico', 'hidráulica',
  'automatizacion', 'automatización',
  'catalogo', 'catálogo', 'especificacion', 'especificación',
  'producto', 'productos',
  // Fragmentos parciales de palabras técnicas
  'neum', 'lvula', 'electric', 'electr', 'hidrau', 'automat',
  // Conceptos no-fabricante
  'system', 'sistema', 'device', 'dispositivo', 'energy', 'energia',
  'potencia', 'control', 'line', 'linea', 'serie', 'series',
  'family', 'familia', 'range', 'rango', 'type', 'tipo',
  'size', 'tamaño', 'dimension', 'dimensiones'
]);

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Comprueba si un valor de manufacturer_name está derivado de un token de la
// consulta o es un término genérico. En cualquiera de los dos casos, NO constituye
// evidencia de fabricante y debe descartarse.
export function isQueryDerivedManufacturer(manufacturerName, query) {
  if (!manufacturerName) return false;
  const mfrRaw = String(manufacturerName).toLowerCase().trim();
  const mfrNorm = normalize(manufacturerName);
  if (!mfrNorm || mfrNorm.length < 2) return false;

  // Término genérico: nunca es un fabricante.
  if (GENERIC_MANUFACTURER_TERMS.has(mfrRaw)) return true;
  if (GENERIC_MANUFACTURER_TERMS.has(mfrNorm)) return true;

  // Coincidencia con un token de la consulta: el token por sí solo no es
  // evidencia de fabricante (puede ser "balero", "neum", "electric", etc.).
  if (query) {
    const queryTokens = String(query).split(/[^A-Za-z0-9]+/).filter(Boolean).map(normalize);
    if (queryTokens.includes(mfrNorm)) return true;
    // Coincidencia parcial con token de consulta: si el manufacturer_name es
    // un substring de un token de consulta (o viceversa) y es corto, es sospechoso.
    for (const qt of queryTokens) {
      if (qt.length >= 4 && (qt === mfrNorm || (qt.includes(mfrNorm) && mfrNorm.length >= 4))) return true;
    }
  }
  return false;
}

// Comprueba si un part_number tiene estructura válida (debe contener dígitos
// y letras, o al menos dígitos). Un part_number sin dígitos no es un PN real.
export function isInvalidPartNumber(partNumber) {
  if (!partNumber) return false;
  const pn = String(partNumber).trim();
  if (!pn) return false;
  // Un PN debe contener al menos un dígito para ser válido.
  if (!/\d/.test(pn)) return true;
  return false;
}

// Sanitiza los campos de identidad de un resultado, eliminando contaminación
// derivada de tokens de la consulta o términos genéricos.
// Devuelve una copia con los campos limpiados (no muta el original).
export function sanitizeResultIdentity(result, query) {
  if (!result || typeof result !== 'object') return result;
  const copy = { ...result };

  // Una consulta que sea exactamente un fabricante conocido puede producir
  // legítimamente manufacturer_name == query cuando la fuente es oficial.
  // No confundir esa identidad demostrada con el caso contaminado en el que
  // un término de categoría ("balero", "neum", "electric", etc.) fue copiado
  // desde la consulta. Para fuentes oficiales, una coincidencia exacta se
  // conserva; las reglas genéricas siguen bloqueando categorías/fracciones.
  const normalizedQuery = normalize(query);
  const normalizedManufacturer = normalize(copy.manufacturer_name);
  const isOfficialExactManufacturer = copy.source_type === 'official'
    && normalizedQuery
    && normalizedManufacturer
    && normalizedQuery === normalizedManufacturer;

  // manufacturer_name: descartar si deriva de la consulta o es genérico.
  if (!isOfficialExactManufacturer && isQueryDerivedManufacturer(copy.manufacturer_name, query)) {
    const contaminated = copy.manufacturer_name;
    copy.manufacturer_name = '';
    // Limpiar product_name si fue construido desde el manufacturer contaminado.
    if (copy.product_name && contaminated && copy.product_name.includes(contaminated)) {
      copy.product_name = '';
    }
    // Limpiar product_identity si tiene el manufacturer contaminado.
    if (copy.product_identity && copy.product_identity.manufacturer === contaminated) {
      copy.product_identity = { ...copy.product_identity, manufacturer: '' };
    }
  }

  // part_number: descartar si no tiene estructura de PN (sin dígitos).
  if (isInvalidPartNumber(copy.part_number)) {
    copy.part_number = '';
  }

  return copy;
}

// Sanitiza un lote de resultados.
export function sanitizeResultsIdentity(results, query) {
  if (!Array.isArray(results)) return results;
  return results.map((r) => sanitizeResultIdentity(r, query));
}