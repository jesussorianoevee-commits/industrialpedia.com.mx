// DEPRECADO: Industrialpedia ya no usa IA para nada, incluida la traducción.
// La localización de nombre/descripción/especificaciones se hace ahora por
// reglas deterministas de código en src/lib/i18n.jsx (localizeProductName,
// localizeTechnicalText, localizeSpecAttribute, localizeSpecValue), aplicadas
// directamente sobre el registro canónico en el momento de renderizar.
//
// Esta función se deja como no-operación (sin llamadas a InvokeLLM ni a
// ningún otro modelo) únicamente para no romper a quien todavía la importe.
// No crea, actualiza ni lee registros de PartTranslation.

export async function autoTranslatePart(_base44: any, _part: any, _options: { languages?: string[]; refreshMachineDrafts?: boolean } = {}) {
  return { created: 0, skipped: 0, failed: 0 };
}
