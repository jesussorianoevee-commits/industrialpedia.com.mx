// Small, deliberately narrow glossary for the dual-language UX pattern
// (design brief #6): show the technical term as-is (never hidden -- a
// specialist reads it directly) plus a short plain-language explanation on
// hover/focus for a non-specialist. Only real, common terms that appear
// verbatim in spec values across this catalog (PNP/NPN output types, IP
// ratings, common connector/protocol codes) -- not a general translation
// table, and not auto-generated from arbitrary spec text.
export const TECHNICAL_GLOSSARY = {
  es: {
    PNP: 'Salida digital tipo sourcing (entrega voltaje positivo)',
    NPN: 'Salida digital tipo sinking (conecta a tierra)',
    IP65: 'Protegido contra polvo y chorros de agua',
    IP66: 'Protegido contra polvo y chorros de agua a presión',
    IP67: 'Protegido contra polvo y inmersión temporal en agua',
    IP68: 'Protegido contra polvo e inmersión prolongada en agua',
    'IO-Link': 'Protocolo de comunicación punto a punto para sensores/actuadores',
    PROFINET: 'Protocolo de red industrial basado en Ethernet',
    PROFIBUS: 'Bus de campo industrial para comunicación entre dispositivos',
    Modbus: 'Protocolo de comunicación serie/red para automatización industrial',
    NC: 'Normalmente cerrado (el contacto conduce en reposo)',
    NO: 'Normalmente abierto (el contacto no conduce en reposo)',
  },
  en: {
    PNP: 'Sourcing digital output (delivers positive voltage)',
    NPN: 'Sinking digital output (connects to ground)',
    IP65: 'Protected against dust and water jets',
    IP66: 'Protected against dust and powerful water jets',
    IP67: 'Protected against dust and temporary immersion in water',
    IP68: 'Protected against dust and prolonged immersion in water',
    'IO-Link': 'Point-to-point communication protocol for sensors/actuators',
    PROFINET: 'Ethernet-based industrial network protocol',
    PROFIBUS: 'Industrial fieldbus for device-to-device communication',
    Modbus: 'Serial/network communication protocol for industrial automation',
    NC: 'Normally closed (contact conducts at rest)',
    NO: 'Normally open (contact does not conduct at rest)',
  },
};

/** Returns the plain-language explanation for a technical term, if this glossary has one -- null otherwise (never fabricated). */
export function glossaryExplain(term, language = 'es') {
  const table = TECHNICAL_GLOSSARY[language] || TECHNICAL_GLOSSARY.es;
  return table[String(term || '').trim()] || null;
}
