import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';

export const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const translations = {
  es: { search: 'Buscar', compare: 'Comparar', decide: 'Decidir', login: 'Ingresar', light: 'Claro', dark: 'Oscuro', language: 'Idioma', back: 'Volver', filters: 'Filtros', clear: 'Limpiar', recentSearches: 'Búsquedas recientes', searchPlaceholder: 'Ej: DSNU-25-25-PPV-A, 6ES7214-1AG40-0XB0, cilindro Festo…', searchParts: 'Escribe una refacción industrial para buscarla.', loadingParts: 'Cargando refacciones…', foundParts: 'refacciones', foundPartsLabel: 'Refacciones encontradas', structuredSources: 'Fuentes estructuradas', partNotFound: 'Componente no encontrado o no publicado.', technicalSpecs: 'Especificaciones', componentEvidence: 'Evidencia del componente', noEvidence: 'Sin evidencia técnica vinculada', autoTranslation: 'Traducción automática · pendiente de revisión técnica', technicalComparison: 'Comparación técnica', compareSubtitle: 'Compara especificaciones técnicas sin declarar intercambiabilidad cuando faltan requisitos críticos.', technicalDecision: 'Decisión técnica', decisionTitle: 'Decidir', decisionSubtitle: 'Define la necesidad técnica y deja que Industrialpedia filtre el Knowledge Core.', technicalFamily: 'Familia técnica', requirements: 'Requisitos técnicos', add: 'Agregar', attribute: 'Atributo', requiredValue: 'Valor requerido', takeDecision: 'Tomar decisión', evaluating: 'Evaluando…', result: 'Resultado', noResults: 'No hay componentes que puedan demostrarse como candidatos con los datos actuales.', compatible: 'Compatible', noMatch: 'No coincide', notSpecified: 'No especificado', moreAlternatives: 'Ver más alternativas', noMore: '¿No encontraste lo que buscas?', expandSearch: 'Podemos ampliar la búsqueda para mostrarte más alternativas.', baseComponent: 'COMPONENTE BASE', alternatives: 'ALTERNATIVAS', compatibilityMap: 'Mapa de compatibilidad', compatibility: 'Compatibilidad', dataInsufficient: 'DATOS INSUFICIENTES', review: 'Revisión técnica', equal: 'Igual', different: 'Diferente', notComparable: 'No comparable', recommended: 'RECOMENDADA', meets: 'CUMPLE', requiresReview: 'REQUIERE REVISIÓN', insufficientEvidence: 'EVIDENCIA INSUFICIENTE', doesNotMeet: 'NO CUMPLE', deterministic: 'Determinístico', verified: 'Verificado', evidence: 'evidencia(s)', noVerifiedImage: 'Sin imagen verificada', externalSource: 'Fuente externa', partNumber: 'Referencia', viewComponent: 'Ver componente', findAlternatives: 'Encontrar alternativas', compareAlternatives: 'Comparar alternativas', comparing: 'Comparando…', creatingSheet: 'Creando ficha…', viewTechnicalSheet: 'Ver ficha técnica', exploreByArea: 'Explora por área', areas: 'áreas', types: 'tipos', examples: 'Ejemplos', references: 'referencias', reference: 'referencia', more: 'más', updatedAutomatically: 'Actualizado automáticamente', structuredInfo: 'Información estructurada', upToFiveAlternatives: 'Hasta 5 alternativas', findYourPart: 'Encuentra tu', sparePart: 'refacción', inSeconds: 'en segundos.', communityForum: 'Foro de la comunidad', comingSoon: 'PRÓXIMAMENTE', forumDescription: 'Comparte experiencias con refacciones, resuelve dudas y valida reemplazos entre marcas con otros técnicos.', enterForum: 'Entrar al foro', workflowLabel: 'El flujo Industrialpedia', workflowTitle: 'De la búsqueda a la decisión.', workflowSearch: 'Encuentra información por número de parte, fabricante o descripción.', workflowFind: 'Identifica alternativas relevantes sin saturarte de resultados.', workflowCompare: 'Contrasta las especificaciones técnicas que realmente importan.', workflowDecide: 'Llega a una decisión con información técnica clara y trazable.', discoveringProducts: 'Descubriendo productos…', retry: 'Reintentar', page: 'pág.', noSource: 'S/F', verifiedSpecs: 'Con especificaciones verificadas', noTechnicalSpecsSource: 'No hay especificaciones técnicas en esta fuente.', extractedUnverified: 'Extraídas · no verificadas', sourceTitle: 'Título de la fuente', foundSourcePart: 'Fuente encontrada. La ficha técnica se construye directamente desde esta fuente, sin inventar datos.', foundSourceNoPart: 'Fuente encontrada. Esta consulta aún no identifica un número de parte concreto; revisa la fuente para ver los productos disponibles.', source: 'fuente', sources: 'fuente(s)', viewSource: 'Ver fuente', viewProduct: 'Ver producto', productNotIdentified: 'Producto no identificado', spec: 'especificación', specs: 'especificaciones', published: 'Publicado', validated: 'Validado', incomplete: 'Incompleto', rejected: 'Rechazado', processed: 'Procesado', foundPendingVerification: 'Encontrado · pendiente de verificación', pendingVerification: 'Pendiente de verificación', publishedKnowledge: 'Solo conocimiento publicado', technicalSpecification: 'Con especificación técnica', manufacturer: 'Fabricante', category: 'Categoría' },
  en: { search: 'Search', compare: 'Compare', decide: 'Decide', login: 'Sign in', light: 'Light', dark: 'Dark', language: 'Language', back: 'Back', filters: 'Filters', clear: 'Clear', recentSearches: 'Recent searches', searchPlaceholder: 'Ex: DSNU-25-25-PPV-A, 6ES7214-1AG40-0XB0, Festo cylinder…', searchParts: 'Enter an industrial spare part to search.', loadingParts: 'Loading spare parts…', foundParts: 'spare parts', foundPartsLabel: 'Spare parts found', structuredSources: 'Structured sources', partNotFound: 'Component not found or not published.', technicalSpecs: 'Specifications', componentEvidence: 'Component evidence', noEvidence: 'No technical evidence linked', autoTranslation: 'Automatic translation · pending technical review', technicalComparison: 'Technical comparison', compareSubtitle: 'Compare technical specifications without declaring interchangeability when critical requirements are missing.', technicalDecision: 'Technical decision', decisionTitle: 'Decide', decisionSubtitle: 'Define the technical need and let Industrialpedia filter the Knowledge Core.', technicalFamily: 'Technical family', requirements: 'Technical requirements', add: 'Add', attribute: 'Attribute', requiredValue: 'Required value', takeDecision: 'Make decision', evaluating: 'Evaluating…', result: 'Result', noResults: 'No components can be demonstrated as candidates with the current data.', compatible: 'Compatible', noMatch: 'No match', notSpecified: 'Not specified', moreAlternatives: 'See more alternatives', noMore: 'Didn’t find what you need?', expandSearch: 'We can expand the search to show more alternatives.', baseComponent: 'BASE COMPONENT', alternatives: 'ALTERNATIVES', compatibilityMap: 'Compatibility map', compatibility: 'Compatibility', dataInsufficient: 'INSUFFICIENT DATA', review: 'Technical review', equal: 'Equal', different: 'Different', notComparable: 'Not comparable', recommended: 'RECOMMENDED', meets: 'MEETS', requiresReview: 'REQUIRES REVIEW', insufficientEvidence: 'INSUFFICIENT EVIDENCE', doesNotMeet: 'DOES NOT MEET', deterministic: 'Deterministic', verified: 'Verified', evidence: 'evidence', noVerifiedImage: 'No verified image', externalSource: 'External source', partNumber: 'Part number', viewComponent: 'View component', findAlternatives: 'Find alternatives', compareAlternatives: 'Compare alternatives', comparing: 'Comparing…', creatingSheet: 'Creating sheet…', viewTechnicalSheet: 'View technical sheet', exploreByArea: 'Explore by area', areas: 'areas', types: 'types', examples: 'Examples', references: 'references', reference: 'reference', more: 'more', updatedAutomatically: 'Automatically updated', structuredInfo: 'Structured information', upToFiveAlternatives: 'Up to 5 alternatives', findYourPart: 'Find your', sparePart: 'spare part', inSeconds: 'in seconds.', communityForum: 'Community forum', comingSoon: 'COMING SOON', forumDescription: 'Share spare-part experiences, resolve questions and validate replacements across brands with other technicians.', enterForum: 'Enter forum', workflowLabel: 'The Industrialpedia workflow', workflowTitle: 'From search to decision.', workflowSearch: 'Find information by part number, manufacturer or description.', workflowFind: 'Identify relevant alternatives without overwhelming results.', workflowCompare: 'Compare the technical specifications that actually matter.', workflowDecide: 'Reach a decision with clear, traceable technical information.', discoveringProducts: 'Discovering products…', retry: 'Retry', page: 'p.', noSource: 'N/A', verifiedSpecs: 'Verified specifications', noTechnicalSpecsSource: 'No technical specifications in this source.', extractedUnverified: 'Extracted · unverified', sourceTitle: 'Source title', foundSourcePart: 'Source found. The technical sheet is built directly from this source without inventing data.', foundSourceNoPart: 'Source found. This query does not yet identify a specific part number; review the source to see available products.', source: 'source', sources: 'sources', viewSource: 'View source', viewProduct: 'View product', productNotIdentified: 'Product not identified', spec: 'spec', specs: 'specs', published: 'Published', validated: 'Validated', incomplete: 'Incomplete', rejected: 'Rejected', processed: 'Processed', foundPendingVerification: 'Found · pending verification', pendingVerification: 'Pending verification', publishedKnowledge: 'Published knowledge only', technicalSpecification: 'With technical specification', manufacturer: 'Manufacturer', category: 'Category' },
  de: { search: 'Suchen', compare: 'Vergleichen', decide: 'Entscheiden', login: 'Anmelden', light: 'Hell', dark: 'Dunkel', language: 'Sprache', back: 'Zurück', filters: 'Filter', clear: 'Löschen', recentSearches: 'Letzte Suchen', searchPlaceholder: 'z. B. DSNU-25-25-PPV-A, 6ES7214-1AG40-0XB0, Festo-Zylinder…', searchParts: 'Industrielles Ersatzteil suchen.', loadingParts: 'Ersatzteile werden geladen…', foundParts: 'Ersatzteile', foundPartsLabel: 'Gefundene Ersatzteile', structuredSources: 'Strukturierte Quellen', partNotFound: 'Komponente nicht gefunden oder nicht veröffentlicht.', technicalSpecs: 'Spezifikationen', componentEvidence: 'Komponentennachweis', noEvidence: 'Kein technischer Nachweis verknüpft', autoTranslation: 'Automatische Übersetzung · technische Prüfung ausstehend', technicalComparison: 'Technischer Vergleich', compareSubtitle: 'Technische Spezifikationen vergleichen, ohne Austauschbarkeit zu erklären, wenn kritische Anforderungen fehlen.', technicalDecision: 'Technische Entscheidung', decisionTitle: 'Entscheiden', decisionSubtitle: 'Technischen Bedarf definieren und Industrialpedia den Knowledge Core filtern lassen.', technicalFamily: 'Technische Familie', requirements: 'Technische Anforderungen', add: 'Hinzufügen', attribute: 'Attribut', requiredValue: 'Erforderlicher Wert', takeDecision: 'Entscheidung treffen', evaluating: 'Wird bewertet…', result: 'Ergebnis', noResults: 'Mit den aktuellen Daten können keine Kandidaten nachgewiesen werden.', compatible: 'Kompatibel', noMatch: 'Keine Übereinstimmung', notSpecified: 'Nicht angegeben', moreAlternatives: 'Weitere Alternativen', noMore: 'Nicht das Richtige gefunden?', expandSearch: 'Die Suche kann erweitert werden, um weitere Alternativen anzuzeigen.', baseComponent: 'BASISKOMPONENTE', alternatives: 'ALTERNATIVEN', compatibilityMap: 'Kompatibilitätskarte', compatibility: 'Kompatibilität', dataInsufficient: 'UNZUREICHENDE DATEN', review: 'Technische Prüfung', equal: 'Gleich', different: 'Unterschiedlich', notComparable: 'Nicht vergleichbar', recommended: 'EMPFOHLEN', meets: 'ERFÜLLT', requiresReview: 'PRÜFUNG ERFORDERLICH', insufficientEvidence: 'UNZUREICHENDER NACHWEIS', doesNotMeet: 'NICHT ERFÜLLT', deterministic: 'Deterministisch', verified: 'Verifiziert', evidence: 'Nachweis', noVerifiedImage: 'Kein verifiziertes Bild', externalSource: 'Externe Quelle', partNumber: 'Referenz', viewComponent: 'Komponente öffnen', findAlternatives: 'Alternativen finden', compareAlternatives: 'Alternativen vergleichen', comparing: 'Vergleich…', creatingSheet: 'Datenblatt wird erstellt…', viewTechnicalSheet: 'Technisches Datenblatt', exploreByArea: 'Nach Bereich erkunden', areas: 'Bereiche', types: 'Typen', examples: 'Beispiele', references: 'Referenzen', reference: 'Referenz', more: 'mehr', updatedAutomatically: 'Automatisch aktualisiert', structuredInfo: 'Strukturierte Informationen', upToFiveAlternatives: 'Bis zu 5 Alternativen', findYourPart: 'Finden Sie Ihr', sparePart: 'Ersatzteil', inSeconds: 'in Sekunden.', communityForum: 'Community-Forum', comingSoon: 'DEMNÄCHST', forumDescription: 'Teilen Sie Erfahrungen mit Ersatzteilen, lösen Sie Fragen und validieren Sie markenübergreifende Ersatzteile mit anderen Technikern.', enterForum: 'Forum öffnen', workflowLabel: 'Der Industrialpedia-Ablauf', workflowTitle: 'Von der Suche zur Entscheidung.', workflowSearch: 'Informationen nach Teilenummer, Hersteller oder Beschreibung finden.', workflowFind: 'Relevante Alternativen erkennen, ohne mit Ergebnissen überladen zu werden.', workflowCompare: 'Die wirklich wichtigen technischen Spezifikationen vergleichen.', workflowDecide: 'Eine Entscheidung mit klaren und nachvollziehbaren technischen Informationen treffen.', discoveringProducts: 'Produkte werden gesucht…', retry: 'Erneut versuchen', page: 'S.', noSource: 'k. A.', verifiedSpecs: 'Verifizierte Spezifikationen', noTechnicalSpecsSource: 'Keine technischen Spezifikationen in dieser Quelle.', extractedUnverified: 'Extrahiert · nicht verifiziert', sourceTitle: 'Quellentitel', foundSourcePart: 'Quelle gefunden. Das technische Datenblatt wird direkt aus dieser Quelle erstellt, ohne Daten zu erfinden.', foundSourceNoPart: 'Quelle gefunden. Diese Abfrage identifiziert noch keine konkrete Teilenummer; prüfen Sie die Quelle für verfügbare Produkte.', source: 'Quelle', sources: 'Quellen', viewSource: 'Quelle öffnen', viewProduct: 'Produkt öffnen', productNotIdentified: 'Produkt nicht identifiziert', spec: 'Spez.', specs: 'Spez.', published: 'Veröffentlicht', validated: 'Validiert', incomplete: 'Unvollständig', rejected: 'Abgelehnt', processed: 'Verarbeitet', foundPendingVerification: 'Gefunden · Prüfung ausstehend', pendingVerification: 'Prüfung ausstehend', publishedKnowledge: 'Nur veröffentlichtes Wissen', technicalSpecification: 'Mit technischer Spezifikation', manufacturer: 'Hersteller', category: 'Kategorie' },
  fr: { search: 'Rechercher', compare: 'Comparer', decide: 'Décider', login: 'Connexion', light: 'Clair', dark: 'Sombre', language: 'Langue', back: 'Retour', filters: 'Filtres', clear: 'Effacer', recentSearches: 'Recherches récentes', searchPlaceholder: 'Ex. : DSNU-25-25-PPV-A, 6ES7214-1AG40-0XB0, vérin Festo…', searchParts: 'Recherchez une pièce industrielle.', loadingParts: 'Chargement des pièces…', foundParts: 'pièces', foundPartsLabel: 'Pièces trouvées', structuredSources: 'Sources structurées', partNotFound: 'Composant introuvable ou non publié.', technicalSpecs: 'Spécifications', componentEvidence: 'Preuve du composant', noEvidence: 'Aucune preuve technique liée', autoTranslation: 'Traduction automatique · révision technique en attente', technicalComparison: 'Comparaison technique', compareSubtitle: 'Comparez les spécifications techniques sans déclarer l’interchangeabilité lorsque des exigences critiques manquent.', technicalDecision: 'Décision technique', decisionTitle: 'Décider', decisionSubtitle: 'Définissez le besoin technique et laissez Industrialpedia filtrer le Knowledge Core.', technicalFamily: 'Famille technique', requirements: 'Exigences techniques', add: 'Ajouter', attribute: 'Attribut', requiredValue: 'Valeur requise', takeDecision: 'Prendre une décision', evaluating: 'Évaluation…', result: 'Résultat', noResults: 'Aucun composant ne peut être démontré comme candidat avec les données actuelles.', compatible: 'Compatible', noMatch: 'Aucune correspondance', notSpecified: 'Non spécifié', moreAlternatives: 'Voir plus d’alternatives', noMore: 'Vous n’avez pas trouvé ce qu’il vous faut ?', expandSearch: 'Nous pouvons élargir la recherche pour afficher plus d’alternatives.', baseComponent: 'COMPOSANT DE BASE', alternatives: 'ALTERNATIVES', compatibilityMap: 'Carte de compatibilité', compatibility: 'Compatibilité', dataInsufficient: 'DONNÉES INSUFFISANTES', review: 'Révision technique', equal: 'Égal', different: 'Différent', notComparable: 'Non comparable', recommended: 'RECOMMANDÉE', meets: 'CONFORME', requiresReview: 'RÉVISION REQUISE', insufficientEvidence: 'PREUVE INSUFFISANTE', doesNotMeet: 'NON CONFORME', deterministic: 'Déterministe', verified: 'Vérifié', evidence: 'preuve(s)', noVerifiedImage: 'Aucune image vérifiée', externalSource: 'Source externe', partNumber: 'Référence', viewComponent: 'Voir le composant', findAlternatives: 'Trouver des alternatives', compareAlternatives: 'Comparer les alternatives', comparing: 'Comparaison…', creatingSheet: 'Création de la fiche…', viewTechnicalSheet: 'Voir la fiche technique', exploreByArea: 'Explorer par domaine', areas: 'domaines', types: 'types', examples: 'Exemples', references: 'références', reference: 'référence', more: 'plus', updatedAutomatically: 'Mis à jour automatiquement', structuredInfo: 'Informations structurées', upToFiveAlternatives: 'Jusqu’à 5 alternatives', findYourPart: 'Trouvez votre', sparePart: 'pièce', inSeconds: 'en quelques secondes.', communityForum: 'Forum communautaire', comingSoon: 'BIENTÔT', forumDescription: 'Partagez vos expériences, résolvez des questions et validez des remplacements entre marques avec d’autres techniciens.', enterForum: 'Entrer dans le forum', workflowLabel: 'Le flux Industrialpedia', workflowTitle: 'De la recherche à la décision.', workflowSearch: 'Trouvez des informations par référence, fabricant ou description.', workflowFind: 'Identifiez les alternatives pertinentes sans surcharger les résultats.', workflowCompare: 'Comparez les spécifications techniques réellement importantes.', workflowDecide: 'Prenez une décision avec des informations techniques claires et traçables.', discoveringProducts: 'Recherche de produits…', retry: 'Réessayer', page: 'p.', noSource: 'S/O', verifiedSpecs: 'Spécifications vérifiées', noTechnicalSpecsSource: 'Aucune spécification technique dans cette source.', extractedUnverified: 'Extraites · non vérifiées', sourceTitle: 'Titre de la source', foundSourcePart: 'Source trouvée. La fiche technique est construite directement depuis cette source, sans inventer de données.', foundSourceNoPart: 'Source trouvée. Cette recherche n’identifie pas encore une référence précise ; consultez la source pour les produits disponibles.', source: 'source', sources: 'sources', viewSource: 'Voir la source', viewProduct: 'Voir le produit', productNotIdentified: 'Produit non identifié', spec: 'spéc.', specs: 'spéc.', published: 'Publié', validated: 'Validé', incomplete: 'Incomplet', rejected: 'Rejeté', processed: 'Traité', foundPendingVerification: 'Trouvé · vérification en attente', pendingVerification: 'Vérification en attente', publishedKnowledge: 'Connaissances publiées uniquement', technicalSpecification: 'Avec spécification technique', manufacturer: 'Fabricant', category: 'Catégorie' },
  zh: { search: '搜索', compare: '比较', decide: '决策', login: '登录', light: '浅色', dark: '深色', language: '语言', back: '返回', filters: '筛选', clear: '清除', recentSearches: '最近搜索', searchPlaceholder: '例如：DSNU-25-25-PPV-A、6ES7214-1AG40-0XB0、Festo 气缸…', searchParts: '搜索工业备件。', loadingParts: '正在加载备件…', foundParts: '个备件', foundPartsLabel: '找到的备件', structuredSources: '结构化来源', partNotFound: '未找到组件或组件尚未发布。', technicalSpecs: '技术规格', componentEvidence: '组件证据', noEvidence: '暂无关联技术证据', autoTranslation: '自动翻译 · 等待技术审核', technicalComparison: '技术比较', compareSubtitle: '比较技术规格；缺少关键要求时不声明可互换性。', technicalDecision: '技术决策', decisionTitle: '决策', decisionSubtitle: '定义技术需求，让 Industrialpedia 筛选 Knowledge Core。', technicalFamily: '技术类别', requirements: '技术要求', add: '添加', attribute: '属性', requiredValue: '所需值', takeDecision: '进行决策', evaluating: '评估中…', result: '结果', noResults: '根据当前数据无法证明存在候选组件。', compatible: '兼容', noMatch: '不匹配', notSpecified: '未指定', moreAlternatives: '查看更多替代品', noMore: '没有找到需要的产品？', expandSearch: '可以扩大搜索范围以显示更多替代品。', baseComponent: '基准组件', alternatives: '替代品', compatibilityMap: '兼容性地图', compatibility: '兼容性', dataInsufficient: '数据不足', review: '技术审核', equal: '相同', different: '不同', notComparable: '无法比较', recommended: '推荐', meets: '符合要求', requiresReview: '需要审核', insufficientEvidence: '证据不足', doesNotMeet: '不符合要求', deterministic: '确定性', verified: '已验证', evidence: '条证据', noVerifiedImage: '无已验证图片', externalSource: '外部来源', partNumber: '参考编号', viewComponent: '查看组件', findAlternatives: '查找替代品', compareAlternatives: '比较替代品', comparing: '比较中…', creatingSheet: '正在创建资料…', viewTechnicalSheet: '查看技术资料', exploreByArea: '按领域探索', areas: '个领域', types: '个类型', examples: '示例', references: '个参考', reference: '个参考', more: '更多', updatedAutomatically: '自动更新', structuredInfo: '结构化信息', upToFiveAlternatives: '最多 5 个替代方案', findYourPart: '在几秒内找到', sparePart: '工业备件', inSeconds: '', communityForum: '社区论坛', comingSoon: '即将推出', forumDescription: '与其他技术人员分享备件经验、解决问题并验证不同品牌之间的替代件。', enterForum: '进入论坛', workflowLabel: 'Industrialpedia 工作流', workflowTitle: '从搜索到决策。', workflowSearch: '按零件号、制造商或描述查找信息。', workflowFind: '识别相关替代方案，避免结果过载。', workflowCompare: '比较真正重要的技术规格。', workflowDecide: '基于清晰且可追溯的技术信息做出决策。', discoveringProducts: '正在发现产品…', retry: '重试', page: '页', noSource: '无', verifiedSpecs: '已验证规格', noTechnicalSpecsSource: '此来源没有技术规格。', extractedUnverified: '已提取 · 未验证', sourceTitle: '来源标题', foundSourcePart: '已找到来源。技术资料直接根据该来源构建，不会编造数据。', foundSourceNoPart: '已找到来源。此查询尚未识别具体零件号；请查看来源中的可用产品。', source: '来源', sources: '来源', viewSource: '查看来源', viewProduct: '查看产品', productNotIdentified: '未识别产品', spec: '规格', specs: '规格', published: '已发布', validated: '已验证', incomplete: '不完整', rejected: '已拒绝', processed: '已处理', foundPendingVerification: '已找到 · 等待验证', pendingVerification: '等待验证', publishedKnowledge: '仅已发布知识', technicalSpecification: '具有技术规格', manufacturer: '制造商', category: '类别' },
};

const EXTRA_TRANSLATIONS = {
  es: { notAvailable: 'No disponible', noImage: 'Sin imagen', manufacturerNotIndicated: 'Fabricante no indicado', candidatesConsulted: 'candidatos consultados', specsShort: 'ESPEC.', comparedAgainst: 'Comparado contra', technicalReview: 'Revisión técnica', technicalMatch: 'COINCIDENCIA TÉCNICA', matchingSpecs: 'Propiedades que coinciden', differentSpecs: 'Propiedades diferentes', notCompatible: 'No compatible', similar: 'Similar', insufficientData: 'Datos insuficientes', backToSearch: 'Volver a BUSCAR', document: 'Documento', sourcesTitle: 'Fuentes', closeImage: 'Cerrar imagen', enlargeImage: 'Ver imagen ampliada', tapImageToEnlarge: 'Toca la imagen para ampliarla', imageOf: 'Imagen de', evidenceCount: 'evidencia(s)', productFound: 'Producto encontrado', variantsDetected: 'variantes detectadas', extractingSheet: 'Extrayendo ficha…', viewSheet: 'Ver ficha', officialManufacturer: 'Fabricante oficial', distributor: 'Distribuidor', webSource: 'Fuente web', compareModelSource: 'Ver fuente del modelo', unableToExtractSheet: 'No se pudo extraer la ficha de esta fuente.', unableToBuildSheet: 'No se pudo construir la ficha.', unableToCompareReference: 'No se pudo comparar esta referencia.', enableCompareWhenSpecs: 'Se habilita cuando la referencia externa tiene suficientes especificaciones técnicas.' },
  en: { notAvailable: 'Not available', noImage: 'No image', manufacturerNotIndicated: 'Manufacturer not indicated', candidatesConsulted: 'candidates consulted', specsShort: 'SPECS', comparedAgainst: 'Compared against', technicalReview: 'Technical review', technicalMatch: 'TECHNICAL MATCH', matchingSpecs: 'Matching properties', differentSpecs: 'Different properties', notCompatible: 'Not compatible', similar: 'Similar', insufficientData: 'Insufficient data', backToSearch: 'Back to SEARCH', document: 'Document', sourcesTitle: 'Sources', closeImage: 'Close image', enlargeImage: 'View enlarged image', tapImageToEnlarge: 'Tap the image to enlarge it', imageOf: 'Image of', evidenceCount: 'evidence item(s)', productFound: 'Product found', variantsDetected: 'variants detected', extractingSheet: 'Extracting sheet…', viewSheet: 'View sheet', officialManufacturer: 'Official manufacturer', distributor: 'Distributor', webSource: 'Web source', compareModelSource: 'View model source', unableToExtractSheet: 'Could not extract the sheet from this source.', unableToBuildSheet: 'Could not build the sheet.', unableToCompareReference: 'Could not compare this reference.', enableCompareWhenSpecs: 'Enabled when the external reference has enough technical specifications.' },
  de: { notAvailable: 'Nicht verfügbar', noImage: 'Kein Bild', manufacturerNotIndicated: 'Hersteller nicht angegeben', candidatesConsulted: 'Kandidaten geprüft', specsShort: 'SPEZ.', comparedAgainst: 'Verglichen mit', technicalReview: 'Technische Prüfung', technicalMatch: 'TECHNISCHE ÜBEREINSTIMMUNG', matchingSpecs: 'Übereinstimmende Eigenschaften', differentSpecs: 'Unterschiedliche Eigenschaften', notCompatible: 'Nicht kompatibel', similar: 'Ähnlich', insufficientData: 'Unzureichende Daten', backToSearch: 'Zurück zur SUCHE', document: 'Dokument', sourcesTitle: 'Quellen', closeImage: 'Bild schließen', enlargeImage: 'Vergrößertes Bild anzeigen', tapImageToEnlarge: 'Bild zum Vergrößern antippen', imageOf: 'Bild von', evidenceCount: 'Nachweis(e)', productFound: 'Produkt gefunden', variantsDetected: 'Varianten erkannt', extractingSheet: 'Datenblatt wird extrahiert…', viewSheet: 'Datenblatt anzeigen', officialManufacturer: 'Offizieller Hersteller', distributor: 'Händler', webSource: 'Webquelle', compareModelSource: 'Modellquelle anzeigen', unableToExtractSheet: 'Das Datenblatt konnte aus dieser Quelle nicht extrahiert werden.', unableToBuildSheet: 'Das Datenblatt konnte nicht erstellt werden.', unableToCompareReference: 'Diese Referenz konnte nicht verglichen werden.', enableCompareWhenSpecs: 'Wird aktiviert, wenn die externe Referenz genügend technische Spezifikationen enthält.' },
  fr: { notAvailable: 'Non disponible', noImage: 'Aucune image', manufacturerNotIndicated: 'Fabricant non indiqué', candidatesConsulted: 'candidats consultés', specsShort: 'SPÉC.', comparedAgainst: 'Comparé à', technicalReview: 'Révision technique', technicalMatch: 'CORRESPONDANCE TECHNIQUE', matchingSpecs: 'Propriétés correspondantes', differentSpecs: 'Propriétés différentes', notCompatible: 'Non compatible', similar: 'Similaire', insufficientData: 'Données insuffisantes', backToSearch: 'Retour à RECHERCHER', document: 'Document', sourcesTitle: 'Sources', closeImage: 'Fermer l’image', enlargeImage: 'Voir l’image agrandie', tapImageToEnlarge: 'Touchez l’image pour l’agrandir', imageOf: 'Image de', evidenceCount: 'preuve(s)', productFound: 'Produit trouvé', variantsDetected: 'variantes détectées', extractingSheet: 'Extraction de la fiche…', viewSheet: 'Voir la fiche', officialManufacturer: 'Fabricant officiel', distributor: 'Distributeur', webSource: 'Source web', compareModelSource: 'Voir la source du modèle', unableToExtractSheet: 'Impossible d’extraire la fiche depuis cette source.', unableToBuildSheet: 'Impossible de construire la fiche.', unableToCompareReference: 'Impossible de comparer cette référence.', enableCompareWhenSpecs: 'Activé lorsque la référence externe possède suffisamment de spécifications techniques.' },
  zh: { notAvailable: '不可用', noImage: '无图片', manufacturerNotIndicated: '未注明制造商', candidatesConsulted: '个候选项已查询', specsShort: '规格', comparedAgainst: '比较对象', technicalReview: '技术审核', technicalMatch: '技术匹配', matchingSpecs: '匹配属性', differentSpecs: '不同属性', notCompatible: '不兼容', similar: '相似', insufficientData: '数据不足', backToSearch: '返回搜索', document: '文档', sourcesTitle: '来源', closeImage: '关闭图片', enlargeImage: '查看放大图片', tapImageToEnlarge: '点击图片放大', imageOf: '图片：', evidenceCount: '条证据', productFound: '找到产品', variantsDetected: '个变体已检测到', extractingSheet: '正在提取资料…', viewSheet: '查看资料', officialManufacturer: '官方制造商', distributor: '经销商', webSource: '网页来源', compareModelSource: '查看型号来源', unableToExtractSheet: '无法从该来源提取资料。', unableToBuildSheet: '无法构建资料。', unableToCompareReference: '无法比较该参考编号。', enableCompareWhenSpecs: '当外部参考具有足够的技术规格时启用。' }
};

const COMMUNITY_TRANSLATIONS = {
  es: { communityCompatibility: 'Compatibilidad confirmada por la comunidad', communityDescription: 'Las experiencias de usuarios se registran como evidencia comunitaria y permanecen separadas de la información oficial y de la evidencia técnica canónica.', confirmations: 'Confirmaciones', negativeReports: 'Reportes negativos', uniqueUsers: 'Usuarios únicos', accountRequiredCompatibility: 'Solo los usuarios con una cuenta pueden confirmar o reportar compatibilidad.', signInToParticipate: 'Iniciar sesión para participar', experiencedPartNumber: 'Número de parte con el que tienes experiencia', outcome: 'Resultado', experienceType: 'Tipo de experiencia', compatibleWorked: 'Compatible / funcionó', incompatibleFailed: 'Incompatible / no funcionó', fieldUse: 'Uso en campo', installation: 'Instalación', technicalReviewType: 'Revisión técnica', optionalNote: 'Nota (opcional)', technicalContextPlaceholder: 'Comparte únicamente el contexto técnico relevante.', registering: 'Registrando…', registerExperience: 'Registrar experiencia', communitySaved: 'Tu experiencia quedó registrada como evidencia comunitaria. Si cambias el resultado posteriormente, se actualizará tu registro en lugar de crear un voto duplicado.', communitySaveError: 'No se pudo registrar la confirmación en este momento.' },
  en: { communityCompatibility: 'Compatibility confirmed by the community', communityDescription: 'User experiences are recorded as community evidence and remain separate from official information and canonical technical evidence.', confirmations: 'Confirmations', negativeReports: 'Negative reports', uniqueUsers: 'Unique users', accountRequiredCompatibility: 'Only users with an account can confirm or report compatibility.', signInToParticipate: 'Sign in to participate', experiencedPartNumber: 'Part number you have experience with', outcome: 'Outcome', experienceType: 'Experience type', compatibleWorked: 'Compatible / worked', incompatibleFailed: 'Incompatible / did not work', fieldUse: 'Field use', installation: 'Installation', technicalReviewType: 'Technical review', optionalNote: 'Note (optional)', technicalContextPlaceholder: 'Share only the relevant technical context.', registering: 'Saving…', registerExperience: 'Save experience', communitySaved: 'Your experience was recorded as community evidence. If you change the outcome later, your record will be updated instead of creating a duplicate vote.', communitySaveError: 'Could not register the confirmation at this time.' },
  de: { communityCompatibility: 'Von der Community bestätigte Kompatibilität', communityDescription: 'Nutzererfahrungen werden als Community-Nachweis erfasst und bleiben von offiziellen Informationen und kanonischen technischen Nachweisen getrennt.', confirmations: 'Bestätigungen', negativeReports: 'Negative Meldungen', uniqueUsers: 'Eindeutige Nutzer', accountRequiredCompatibility: 'Nur Nutzer mit einem Konto können Kompatibilität bestätigen oder melden.', signInToParticipate: 'Zum Mitmachen anmelden', experiencedPartNumber: 'Teilenummer, mit der Sie Erfahrung haben', outcome: 'Ergebnis', experienceType: 'Erfahrungsart', compatibleWorked: 'Kompatibel / funktioniert', incompatibleFailed: 'Inkompatibel / funktioniert nicht', fieldUse: 'Feldeinsatz', installation: 'Installation', technicalReviewType: 'Technische Prüfung', optionalNote: 'Notiz (optional)', technicalContextPlaceholder: 'Teilen Sie nur den relevanten technischen Kontext.', registering: 'Wird gespeichert…', registerExperience: 'Erfahrung speichern', communitySaved: 'Ihre Erfahrung wurde als Community-Nachweis gespeichert. Bei einer späteren Änderung wird Ihr bestehender Eintrag aktualisiert.', communitySaveError: 'Die Bestätigung konnte derzeit nicht gespeichert werden.' },
  fr: { communityCompatibility: 'Compatibilité confirmée par la communauté', communityDescription: 'Les expériences des utilisateurs sont enregistrées comme preuve communautaire et restent séparées des informations officielles et des preuves techniques canoniques.', confirmations: 'Confirmations', negativeReports: 'Signalements négatifs', uniqueUsers: 'Utilisateurs uniques', accountRequiredCompatibility: 'Seuls les utilisateurs disposant d’un compte peuvent confirmer ou signaler une compatibilité.', signInToParticipate: 'Se connecter pour participer', experiencedPartNumber: 'Référence avec laquelle vous avez de l’expérience', outcome: 'Résultat', experienceType: 'Type d’expérience', compatibleWorked: 'Compatible / a fonctionné', incompatibleFailed: 'Incompatible / n’a pas fonctionné', fieldUse: 'Utilisation sur le terrain', installation: 'Installation', technicalReviewType: 'Révision technique', optionalNote: 'Note (facultative)', technicalContextPlaceholder: 'Partagez uniquement le contexte technique pertinent.', registering: 'Enregistrement…', registerExperience: 'Enregistrer l’expérience', communitySaved: 'Votre expérience a été enregistrée comme preuve communautaire. Si vous modifiez le résultat ultérieurement, votre enregistrement sera mis à jour.', communitySaveError: 'Impossible d’enregistrer la confirmation pour le moment.' },
  zh: { communityCompatibility: '社区确认的兼容性', communityDescription: '用户经验将作为社区证据记录，并与官方信息及规范技术证据保持分离。', confirmations: '确认', negativeReports: '负面报告', uniqueUsers: '独立用户', accountRequiredCompatibility: '只有拥有账户的用户才能确认或报告兼容性。', signInToParticipate: '登录参与', experiencedPartNumber: '您有使用经验的零件号', outcome: '结果', experienceType: '经验类型', compatibleWorked: '兼容 / 可用', incompatibleFailed: '不兼容 / 不可用', fieldUse: '现场使用', installation: '安装', technicalReviewType: '技术审核', optionalNote: '备注（可选）', technicalContextPlaceholder: '仅分享相关技术背景。', registering: '正在保存…', registerExperience: '提交经验', communitySaved: '您的经验已记录为社区证据。之后更改结果时将更新原记录，而不会创建重复投票。', communitySaveError: '暂时无法登记确认。' }
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('industrialpedia-language');
    return LANGUAGES.some((item) => item.code === saved) ? saved : 'es';
  });

  useEffect(() => {
    localStorage.setItem('industrialpedia-language', language);
    // El selector debe cambiar también el idioma semántico del documento,
    // no solo el texto visible de los componentes.
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    document.documentElement.dir = 'ltr';
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    languages: LANGUAGES,
    t: { ...(translations[language] || translations.es), ...(EXTRA_TRANSLATIONS[language] || EXTRA_TRANSLATIONS.es), ...(COMMUNITY_TRANSLATIONS[language] || COMMUNITY_TRANSLATIONS.es) }
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

const SPEC_ATTRIBUTE_I18N = {
  material: { es: 'Material', en: 'Material', de: 'Material', fr: 'Matière', zh: '材料' },
  'device role': { es: 'Función del dispositivo', en: 'Device role', de: 'Geräterolle', fr: 'Rôle de l’appareil', zh: '设备角色' },
  'io capacity': { es: 'Capacidad de E/S', en: 'I/O capacity', de: 'E/A-Kapazität', fr: 'Capacité E/S', zh: 'I/O 容量' },
  'supply voltage': { es: 'Voltaje de alimentación', en: 'Supply voltage', de: 'Versorgungsspannung', fr: 'Tension d’alimentation', zh: '供电电压' },
  'network protocol': { es: 'Protocolo de red', en: 'Network protocol', de: 'Netzwerkprotokoll', fr: 'Protocole réseau', zh: '网络协议' },
  'overall length': { es: 'Longitud total', en: 'Overall length', de: 'Gesamtlänge', fr: 'Longueur totale', zh: '总长度' },
  'model number': { es: 'Número de modelo', en: 'Model number', de: 'Modellnummer', fr: 'Numéro de modèle', zh: '型号' },
  'product name': { es: 'Nombre del producto', en: 'Product name', de: 'Produktname', fr: 'Nom du produit', zh: '产品名称' },
  leg: { es: 'Pata', en: 'Leg', de: 'Schenkel', fr: 'Patte', zh: '支腿' },
  legs: { es: 'Patas', en: 'Legs', de: 'Schenkel', fr: 'Pattes', zh: '支腿' },
  'rubber stopper': { es: 'Tope de goma', en: 'Rubber stopper', de: 'Gummistopfen', fr: 'Butée en caoutchouc', zh: '橡胶塞' },
  'rubber guard': { es: 'Protector de goma', en: 'Rubber guard', de: 'Gummischutz', fr: 'Protection en caoutchouc', zh: '橡胶护套' },
  'adapter (mm)': { es: 'Adaptador (mm)', en: 'Adapter (mm)', de: 'Adapter (mm)', fr: 'Adaptateur (mm)', zh: '适配器 (mm)' },
  'outer cylinder length (mm)': { es: 'Longitud exterior del cilindro (mm)', en: 'Outer cylinder length (mm)', de: 'Äußere Zylinderlänge (mm)', fr: 'Longueur extérieure du cylindre (mm)', zh: '外圆柱长度 (mm)' },
  'connection point': { es: 'Punto de conexión', en: 'Connection point', de: 'Anschlusspunkt', fr: 'Point de connexion', zh: '连接点' },
  'connection points': { es: 'Puntos de conexión', en: 'Connection points', de: 'Anschlusspunkte', fr: 'Points de connexion', zh: '连接点' },
  connection: { es: 'Conexión', en: 'Connection', de: 'Anschluss', fr: 'Connexion', zh: '连接' },
  connector: { es: 'Conector', en: 'Connector', de: 'Stecker', fr: 'Connecteur', zh: '连接器' },
  'connector type': { es: 'Tipo de conector', en: 'Connector type', de: 'Steckertyp', fr: 'Type de connecteur', zh: '连接器类型' },
  'connection type': { es: 'Tipo de conexión', en: 'Connection type', de: 'Anschlussart', fr: 'Type de connexion', zh: '连接类型' },
  'port size': { es: 'Tamaño de puerto', en: 'Port size', de: 'Anschlussgröße', fr: 'Taille du port', zh: '接口尺寸' },
  'connection port size': { es: 'Tamaño del puerto de conexión', en: 'Connection port size', de: 'Anschlussgröße', fr: 'Taille du port de connexion', zh: '连接接口尺寸' },
  'fluid used': { es: 'Fluido utilizado', en: 'Fluid used', de: 'Verwendetes Medium', fr: 'Fluide utilisé', zh: '使用流体' },
  configuration: { es: 'Configuración', en: 'Configuration', de: 'Konfiguration', fr: 'Configuration', zh: '配置' },
  'inlet air pressure': { es: 'Presión de entrada de aire', en: 'Inlet air pressure', de: 'Eingangsluftdruck', fr: 'Pression d’entrée d’air', zh: '入口空气压力' },
  'outlet air atmospheric pressure dew point': { es: 'Punto de rocío atmosférico del aire de salida', en: 'Outlet air atmospheric pressure dew point', de: 'Taupunkt des Auslassluftdrucks bei Atmosphärendruck', fr: 'Point de rosée atmosphérique de l’air en sortie', zh: '出口空气大气压露点' },
  'adjustment pressure': { es: 'Presión de ajuste', en: 'Adjustment pressure', de: 'Einstelldruck', fr: 'Pression de réglage', zh: '调节压力' },
  'processing air flow rate (m3/min)': { es: 'Caudal de aire de proceso (m³/min)', en: 'Processing air flow rate (m³/min)', de: 'Prozessluftdurchfluss (m³/min)', fr: 'Débit d’air de traitement (m³/min)', zh: '处理空气流量 (m³/min)' },
  'filter composition': { es: 'Composición del filtro', en: 'Filter composition', de: 'Filterzusammensetzung', fr: 'Composition du filtre', zh: '过滤器组成' },
  'set pressure range': { es: 'Rango de presión de ajuste', en: 'Set pressure range', de: 'Einstelldruckbereich', fr: 'Plage de pression de réglage', zh: '设定压力范围' },
  'operating temperature range': { es: 'Rango de temperatura de operación', en: 'Operating temperature range', de: 'Betriebstemperaturbereich', fr: 'Plage de température de fonctionnement', zh: '工作温度范围' },
  'fluid medium': { es: 'Medio fluido', en: 'Fluid medium', de: 'Fluidmedium', fr: 'Fluide', zh: '流体介质' },
  'operating pressure': { es: 'Presión de operación', en: 'Operating pressure', de: 'Betriebsdruck', fr: 'Pression de fonctionnement', zh: '工作压力' },
  'maximum pressure': { es: 'Presión máxima', en: 'Maximum pressure', de: 'Maximaldruck', fr: 'Pression maximale', zh: '最大压力' },
  'minimum pressure': { es: 'Presión mínima', en: 'Minimum pressure', de: 'Mindestdruck', fr: 'Pression minimale', zh: '最小压力' },
  'flow rate': { es: 'Caudal', en: 'Flow rate', de: 'Durchfluss', fr: 'Débit', zh: '流量' },
  'air flow rate': { es: 'Caudal de aire', en: 'Air flow rate', de: 'Luftdurchfluss', fr: 'Débit d’air', zh: '空气流量' },
  'connection points count': { es: 'Cantidad de puntos de conexión', en: 'Connection points count', de: 'Anzahl der Anschlusspunkte', fr: 'Nombre de points de connexion', zh: '连接点数量' },
  size: { es: 'Tamaño', en: 'Size', de: 'Größe', fr: 'Taille', zh: '尺寸' },
  voltage: { es: 'Voltaje', en: 'Voltage', de: 'Spannung', fr: 'Tension', zh: '电压' },
  'output voltage': { es: 'Voltaje de salida', en: 'Output voltage', de: 'Ausgangsspannung', fr: 'Tension de sortie', zh: '输出电压' },
  'output voltage range': { es: 'Rango de voltaje de salida', en: 'Output voltage range', de: 'Ausgangsspannungsbereich', fr: 'Plage de tension de sortie', zh: '输出电压范围' },
  'input voltage': { es: 'Voltaje de entrada', en: 'Input voltage', de: 'Eingangsspannung', fr: 'Tension d’entrée', zh: '输入电压' },
  'input voltage range': { es: 'Rango de voltaje de entrada', en: 'Input voltage range', de: 'Eingangsspannungsbereich', fr: 'Plage de tension d’entrée', zh: '输入电压范围' },
  'output current': { es: 'Corriente de salida', en: 'Output current', de: 'Ausgangsstrom', fr: 'Courant de sortie', zh: '输出电流' },
  'output current range': { es: 'Rango de corriente de salida', en: 'Output current range', de: 'Ausgangsstrombereich', fr: 'Plage de courant de sortie', zh: '输出电流范围' },
  'input current': { es: 'Corriente de entrada', en: 'Input current', de: 'Eingangsstrom', fr: 'Courant d’entrée', zh: '输入电流' },
  'accuracy': { es: 'Precisión', en: 'Accuracy', de: 'Genauigkeit', fr: 'Précision', zh: '精度' },
  'voltage accuracy': { es: 'Precisión de voltaje', en: 'Voltage accuracy', de: 'Spannungsgenauigkeit', fr: 'Précision de tension', zh: '电压精度' },
  'current accuracy': { es: 'Precisión de corriente', en: 'Current accuracy', de: 'Stromgenauigkeit', fr: 'Précision du courant', zh: '电流精度' },
  'measurement range': { es: 'Rango de medición', en: 'Measurement range', de: 'Messbereich', fr: 'Plage de mesure', zh: '测量范围' },
  'measurement range (mpa)': { es: 'Rango de medición (MPa)', en: 'Measurement range (MPa)', de: 'Messbereich (MPa)', fr: 'Plage de mesure (MPa)', zh: '测量范围（MPa）' },
  'outer diameter': { es: 'Diámetro exterior', en: 'Outer diameter', de: 'Außendurchmesser', fr: 'Diamètre extérieur', zh: '外径' },
  'nozzle diameter': { es: 'Diámetro de boquilla', en: 'Nozzle diameter', de: 'Düsendurchmesser', fr: 'Diamètre de buse', zh: '喷嘴直径' },
  'metal portion material': { es: 'Material de la parte metálica', en: 'Metal portion material', de: 'Material des Metallteils', fr: 'Matériau de la partie métallique', zh: '金属部分材料' },
  current: { es: 'Corriente', en: 'Current', de: 'Strom', fr: 'Courant', zh: '电流' },
  capacity: { es: 'Capacidad', en: 'Capacity', de: 'Kapazität', fr: 'Capacité', zh: '容量' },
  quantity: { es: 'Cantidad', en: 'Quantity', de: 'Menge', fr: 'Quantité', zh: '数量' },
  resistance: { es: 'Resistencia', en: 'Resistance', de: 'Widerstand', fr: 'Résistance', zh: '电阻' },
  temperature: { es: 'Temperatura', en: 'Temperature', de: 'Temperatur', fr: 'Température', zh: '温度' },
  frequency: { es: 'Frecuencia', en: 'Frequency', de: 'Frequenz', fr: 'Fréquence', zh: '频率' },
  power: { es: 'Potencia', en: 'Power', de: 'Leistung', fr: 'Puissance', zh: '功率' },
  pressure: { es: 'Presión', en: 'Pressure', de: 'Druck', fr: 'Pression', zh: '压力' },
  diameter: { es: 'Diámetro', en: 'Diameter', de: 'Durchmesser', fr: 'Diamètre', zh: '直径' },
  length: { es: 'Longitud', en: 'Length', de: 'Länge', fr: 'Longueur', zh: '长度' },
  width: { es: 'Ancho', en: 'Width', de: 'Breite', fr: 'Largeur', zh: '宽度' },
  height: { es: 'Altura', en: 'Height', de: 'Höhe', fr: 'Hauteur', zh: '高度' },
  depth: { es: 'Profundidad', en: 'Depth', de: 'Tiefe', fr: 'Profondeur', zh: '深度' },
  weight: { es: 'Peso', en: 'Weight', de: 'Gewicht', fr: 'Poids', zh: '重量' },
  volume: { es: 'Volumen', en: 'Volume', de: 'Volumen', fr: 'Volume', zh: '体积' },
  area: { es: 'Área', en: 'Area', de: 'Fläche', fr: 'Surface', zh: '面积' },
  speed: { es: 'Velocidad', en: 'Speed', de: 'Geschwindigkeit', fr: 'Vitesse', zh: '速度' },
  torque: { es: 'Torque', en: 'Torque', de: 'Drehmoment', fr: 'Couple', zh: '扭矩' },
  stroke: { es: 'Carrera', en: 'Stroke', de: 'Hub', fr: 'Course', zh: '行程' },
  mounting: { es: 'Montaje', en: 'Mounting', de: 'Montage', fr: 'Montage', zh: '安装方式' },
  interface: { es: 'Interfaz', en: 'Interface', de: 'Schnittstelle', fr: 'Interface', zh: '接口' },
  protection: { es: 'Protección', en: 'Protection', de: 'Schutzart', fr: 'Protection', zh: '防护等级' },
  rating: { es: 'Clasificación', en: 'Rating', de: 'Nennwert', fr: 'Classe', zh: '等级' },
  thread: { es: 'Rosca', en: 'Thread', de: 'Gewinde', fr: 'Filetage', zh: '螺纹' },
  port: { es: 'Puerto', en: 'Port', de: 'Anschluss', fr: 'Port', zh: '接口' }
};

const TECHNICAL_TERM_I18N = {
  general: { es: '', en: '', de: '', fr: '', zh: '' },
  cylinder: { es: 'Cilindro', en: 'Cylinder', de: 'Zylinder', fr: 'Vérin', zh: '气缸' },
  plc: { es: 'PLC', en: 'PLC', de: 'SPS', fr: 'API', zh: 'PLC' },
  proximity_sensor: { es: 'Sensor de proximidad', en: 'Proximity sensor', de: 'Näherungssensor', fr: 'Capteur de proximité', zh: '接近传感器' },
  pressure_sensor: { es: 'Sensor de presión', en: 'Pressure sensor', de: 'Drucksensor', fr: 'Capteur de pression', zh: '压力传感器' },
  servo_drive: { es: 'Servodrive', en: 'Servo drive', de: 'Servoantrieb', fr: 'Servo-variateur', zh: '伺服驱动器' },
  servo_motor: { es: 'Servomotor', en: 'Servo motor', de: 'Servomotor', fr: 'Servomoteur', zh: '伺服电机' },
  solenoid_valve: { es: 'Válvula solenoide', en: 'Solenoid valve', de: 'Magnetventil', fr: 'Électrovanne', zh: '电磁阀' },
  fieldbus_node: { es: 'Nodo Fieldbus', en: 'Fieldbus node', de: 'Fieldbus-Knoten', fr: 'Nœud Fieldbus', zh: '现场总线节点' },
  'Texas Instruments': { es: 'Texas Instruments', en: 'Texas Instruments', de: 'Texas Instruments', fr: 'Texas Instruments', zh: '德州仪器' }
};

const SPEC_WORD_I18N = {
  connection: { es: 'conexión', en: 'connection', de: 'Anschluss', fr: 'connexion', zh: '连接' },
  points: { es: 'puntos', en: 'points', de: 'Punkte', fr: 'points', zh: '点' },
  point: { es: 'punto', en: 'point', de: 'Punkt', fr: 'point', zh: '点' },
  type: { es: 'tipo', en: 'type', de: 'Typ', fr: 'type', zh: '类型' },
  used: { es: 'utilizado', en: 'used', de: 'verwendet', fr: 'utilisé', zh: '使用' },
  fluid: { es: 'fluido', en: 'fluid', de: 'Medium', fr: 'fluide', zh: '流体' },
  air: { es: 'aire', en: 'air', de: 'Luft', fr: 'air', zh: '空气' },
  inlet: { es: 'entrada', en: 'inlet', de: 'Eingang', fr: 'entrée', zh: '入口' },
  outlet: { es: 'salida', en: 'outlet', de: 'Ausgang', fr: 'sortie', zh: '出口' },
  pressure: { es: 'presión', en: 'pressure', de: 'Druck', fr: 'pression', zh: '压力' },
  range: { es: 'rango', en: 'range', de: 'Bereich', fr: 'plage', zh: '范围' },
  operating: { es: 'operación', en: 'operating', de: 'Betriebs', fr: 'fonctionnement', zh: '工作' },
  temperature: { es: 'temperatura', en: 'temperature', de: 'Temperatur', fr: 'température', zh: '温度' },
  filter: { es: 'filtro', en: 'filter', de: 'Filter', fr: 'filtre', zh: '过滤器' },
  composition: { es: 'composición', en: 'composition', de: 'Zusammensetzung', fr: 'composition', zh: '组成' },
  adjustment: { es: 'ajuste', en: 'adjustment', de: 'Einstellung', fr: 'réglage', zh: '调节' },
  processing: { es: 'proceso', en: 'processing', de: 'Prozess', fr: 'traitement', zh: '处理' },
  flow: { es: 'flujo', en: 'flow', de: 'Durchfluss', fr: 'débit', zh: '流量' },
  rate: { es: 'caudal', en: 'rate', de: 'Rate', fr: 'débit', zh: '速率' },
  size: { es: 'tamaño', en: 'size', de: 'Größe', fr: 'taille', zh: '尺寸' },
  material: { es: 'material', en: 'material', de: 'Material', fr: 'matière', zh: '材料' },
  model: { es: 'modelo', en: 'model', de: 'Modell', fr: 'modèle', zh: '型号' },
  number: { es: 'número', en: 'number', de: 'Nummer', fr: 'numéro', zh: '编号' },
  name: { es: 'nombre', en: 'name', de: 'Name', fr: 'nom', zh: '名称' },
  product: { es: 'producto', en: 'product', de: 'Produkt', fr: 'produit', zh: '产品' },
  mounting: { es: 'montaje', en: 'mounting', de: 'Montage', fr: 'montage', zh: '安装' },
  protection: { es: 'protección', en: 'protection', de: 'Schutz', fr: 'protection', zh: '防护' },
  maximum: { es: 'máximo', en: 'maximum', de: 'maximal', fr: 'maximal', zh: '最大' },
  minimum: { es: 'mínimo', en: 'minimum', de: 'minimal', fr: 'minimal', zh: '最小' },
  length: { es: 'longitud', en: 'length', de: 'Länge', fr: 'longueur', zh: '长度' },
  width: { es: 'ancho', en: 'width', de: 'Breite', fr: 'largeur', zh: '宽度' },
  height: { es: 'altura', en: 'height', de: 'Höhe', fr: 'hauteur', zh: '高度' },
  diameter: { es: 'diámetro', en: 'diameter', de: 'Durchmesser', fr: 'diamètre', zh: '直径' },
  depth: { es: 'profundidad', en: 'depth', de: 'Tiefe', fr: 'profondeur', zh: '深度' },
  voltage: { es: 'voltaje', en: 'voltage', de: 'Spannung', fr: 'tension', zh: '电压' },
  current: { es: 'corriente', en: 'current', de: 'Strom', fr: 'courant', zh: '电流' },
  power: { es: 'potencia', en: 'power', de: 'Leistung', fr: 'puissance', zh: '功率' },
  frequency: { es: 'frecuencia', en: 'frequency', de: 'Frequenz', fr: 'fréquence', zh: '频率' },
  output: { es: 'salida', en: 'output', de: 'Ausgang', fr: 'sortie', zh: '输出' },
  input: { es: 'entrada', en: 'input', de: 'Eingang', fr: 'entrée', zh: '输入' },
  accuracy: { es: 'precisión', en: 'accuracy', de: 'Genauigkeit', fr: 'précision', zh: '精度' }
};

function normalizeI18nKey(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function localizeSpecAttribute(attribute, language = 'es') {
  const original = String(attribute || '').trim();
  const key = normalizeI18nKey(original);
  if (!original) return '';
  if (SPEC_ATTRIBUTE_I18N[key]?.[language]) return SPEC_ATTRIBUTE_I18N[key][language];

  // Technical labels are UI metadata, not source results. For an unknown
  // compound label, translate known English attribute words while preserving
  // numbers, units, model codes and punctuation exactly.
  const translated = key.replace(/[a-z]+/gi, (word) => {
    const entry = SPEC_WORD_I18N[word.toLowerCase()];
    return entry?.[language] || word;
  });
  return translated;
}

const TECHNICAL_PHRASE_I18N = {
  'interface module': { es: 'módulo de interfaz', en: 'interface module', de: 'Schnittstellenmodul', fr: 'module d’interface', zh: '接口模块' },
  '2-port interface module': { es: 'módulo de interfaz de 2 puertos', en: '2-port interface module', de: '2-Port-Schnittstellenmodul', fr: 'module d’interface à 2 ports', zh: '2 端口接口模块' },
  'supporting up to': { es: 'compatible con hasta', en: 'supporting up to', de: 'unterstützt bis zu', fr: 'prenant en charge jusqu’à', zh: '最多支持' },
  'i/o modules': { es: 'módulos de E/S', en: 'I/O modules', de: 'E/A-Module', fr: 'modules E/S', zh: 'I/O 模块' },
  'io device': { es: 'dispositivo de E/S', en: 'I/O device', de: 'E/A-Gerät', fr: 'appareil E/S', zh: 'I/O 设备' },
  'printed circuit boards': { es: 'placas de circuito impreso', en: 'printed circuit boards', de: 'Leiterplatten', fr: 'circuits imprimés', zh: '印刷电路板' },
  'tweezers for': { es: 'Pinzas para', en: 'Tweezers for', de: 'Pinzette für', fr: 'Pincettes pour', zh: '用于的镊子' },
  'overall length': { es: 'Longitud total', en: 'Overall length', de: 'Gesamtlänge', fr: 'Longueur totale', zh: '总长度' },
  'high feature': { es: 'versión avanzada', en: 'High Feature', de: 'High-Feature-Version', fr: 'version avancée', zh: '高级版本' },
  'pressure gauge': { es: 'Manómetro de presión', en: 'Pressure gauge', de: 'Manometer', fr: 'Manomètre', zh: '压力表' },
  'model number': { es: 'Número de modelo', en: 'Model number', de: 'Modellnummer', fr: 'Numéro de modèle', zh: '型号' },
  'measurement range': { es: 'Rango de medición', en: 'Measurement range', de: 'Messbereich', fr: 'Plage de mesure', zh: '测量范围' },
  'outer diameter': { es: 'Diámetro exterior', en: 'Outer diameter', de: 'Außendurchmesser', fr: 'Diamètre extérieur', zh: '外径' },
  'nozzle diameter': { es: 'Diámetro de boquilla', en: 'Nozzle diameter', de: 'Düsendurchmesser', fr: 'Diamètre de buse', zh: '喷嘴直径' },
  'metal portion material': { es: 'Material de la parte metálica', en: 'Metal portion material', de: 'Material des Metallteils', fr: 'Matériau de la partie métallique', zh: '金属部分材料' },
  'input voltage range': { es: 'Rango de voltaje de entrada', en: 'Input voltage range', de: 'Eingangsspannungsbereich', fr: 'Plage de tension d’entrée', zh: '输入电压范围' },
  'output voltage range': { es: 'Rango de voltaje de salida', en: 'Output voltage range', de: 'Ausgangsspannungsbereich', fr: 'Plage de tension de sortie', zh: '输出电压范围' },
  'stabilized dc power supply': { es: 'Fuente de alimentación de CC estabilizada', en: 'Stabilized DC power supply', de: 'Stabilisierte Gleichstromversorgung', fr: 'Alimentation CC stabilisée', zh: '稳压直流电源' },
  'dc power supply': { es: 'Fuente de alimentación de CC', en: 'DC power supply', de: 'Gleichstromversorgung', fr: 'Alimentation CC', zh: '直流电源' },
  'power supply': { es: 'Fuente de alimentación', en: 'Power supply', de: 'Stromversorgung', fr: 'Alimentation électrique', zh: '电源' },
  'input current range': { es: 'Rango de corriente de entrada', en: 'Input current range', de: 'Eingangsstrombereich', fr: 'Plage de courant d’entrée', zh: '输入电流范围' },
  'cooling method': { es: 'Método de enfriamiento', en: 'Cooling method', de: 'Kühlmethode', fr: 'Méthode de refroidissement', zh: '冷却方式' },
  'natural air cooling': { es: 'Enfriamiento natural por aire', en: 'Natural air cooling', de: 'Natürliche Luftkühlung', fr: 'Refroidissement naturel par air', zh: '自然风冷' },
  'package size': { es: 'Tamaño del paquete', en: 'Package size', de: 'Verpackungsgröße', fr: 'Dimensions de l’emballage', zh: '包装尺寸' }
};

const TECHNICAL_VALUE_I18N = {
  brass: { es: 'Latón', en: 'Brass', de: 'Messing', fr: 'Laiton', zh: '黄铜' },
  steel: { es: 'Acero', en: 'Steel', de: 'Stahl', fr: 'Acier', zh: '钢' },
  stainless_steel: { es: 'Acero inoxidable', en: 'Stainless steel', de: 'Edelstahl', fr: 'Acier inoxydable', zh: '不锈钢' },
  aluminum: { es: 'Aluminio', en: 'Aluminum', de: 'Aluminium', fr: 'Aluminium', zh: '铝' }
};

export function localizeTechnicalText(text, language = 'es') {
  const original = String(text || '');
  if (!original || language === 'en') return original;
  const phrases = Object.keys(TECHNICAL_PHRASE_I18N).sort((a, b) => b.length - a.length);
  return phrases.reduce((out, phrase) => {
    const replacement = TECHNICAL_PHRASE_I18N[phrase]?.[language];
    if (!replacement) return out;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement);
  }, original);
}

// Presentación limpia para títulos externos: elimina solo etiquetas comerciales
// inequívocas y conserva fabricante, referencia, códigos, números y unidades.
export function localizeProductName(name, language = 'es') {
  let value = String(name || '').trim();
  if (!value) return '';
  const noise = ['CUSTOM', 'NEW', 'SALE', 'BEST SELLER', 'FREE SHIPPING', 'HOT SALE', 'WHOLESALE', 'PROMOTION'];
  for (const token of noise) {
    value = value.replaceAll(token, '');
    value = value.replaceAll(token.toLowerCase(), '');
  }
  value = value.replace(/\s{2,}/g, ' ').trim();
  return localizeTechnicalText(value, language);
}

export function localizeSpecValue(value, language = 'es') {
  if (value === null || value === undefined) return value;
  const raw = String(value).trim();
  if (!raw || language === 'en') return raw;
  const key = normalizeI18nKey(raw).replace(/\s+/g, '_');
  return TECHNICAL_VALUE_I18N[key]?.[language] || localizeTechnicalText(raw, language);
}

export function localizeTechnicalTerm(term, language = 'es') {
  const raw = String(term || '').trim();
  if (!raw) return '';
  const direct = TECHNICAL_TERM_I18N[raw]?.[language] ?? TECHNICAL_TERM_I18N[raw.toLowerCase()]?.[language];
  if (direct !== undefined) return direct;
  const entry = Object.entries(TECHNICAL_TERM_I18N).find(([key]) => key.toLowerCase() === raw.toLowerCase());
  return entry?.[1]?.[language] ?? raw;
}

export function localizedCount(count, singular, plural, language = 'es') {
  const n = Number(count) || 0;
  const forms = {
    es: n === 1 ? singular : plural,
    en: n === 1 ? singular : plural,
    de: n === 1 ? singular : plural,
    fr: n === 0 || n === 1 ? singular : plural,
    zh: singular
  };
  return `${n.toLocaleString(language === 'zh' ? 'zh-CN' : language)} ${forms[language] || plural}`;
}

// Resolución única para contenido dinámico de una ficha. La identidad canónica
// (part_id) nunca se traduce: se usa únicamente para recuperar la variante de
// presentación del idioma activo. Si falta, se solicita el backfill acotado y
// se vuelve a leer antes de usar el contenido original como fallback.
export async function getPartTranslation(partId, language) {
  const id = String(partId || '').trim();
  if (!id || !language) return null;

  const read = async () => {
    const rows = await base44.entities.PartTranslation.filter(
      { part_id: id, language },
      null,
      5,
      0,
      ['id', 'part_id', 'language', 'name', 'description', 'category', 'subcategory', 'specifications', 'status', 'translation_version']
    );
    return rows?.[0] || null;
  };

  try {
    let translation = await read();
    // Una traducción parcial no debe considerarse válida: provocaba fichas
    // mezcladas (título traducido pero descripción/especificaciones en inglés).
    const needsRefresh = !translation || !translation.name || !translation.description || translation.status === 'machine_draft';
    if (needsRefresh) {
      try {
        await base44.functions.invoke('EnsurePartTranslations', {
          part_ids: [id],
          language
        });
        translation = await read();
      } catch {
        // El contenido canónico sigue siendo el fallback autoritativo.
      }
    }
    // Devolvemos cualquier contenido localizado útil. Cada campo se aplica de
    // forma independiente en la ficha; así nunca se descarta una traducción
    // válida solo porque otro campo todavía esté pendiente.
    return translation || null;
  } catch {
    return null;
  }
}

// Batch translation lookup: one request for a result page, with the original
// Part data remaining the authoritative fallback. Machine drafts are exposed
// transparently until reviewed/published rather than silently replacing source data.
export async function translateParts(results, language) {
  if (!Array.isArray(results) || results.length === 0 || !language) return results;
  const ids = [...new Set(results.map((r) => r?.id).filter(Boolean))];
  if (ids.length === 0) return results;
  try {
    let translations = await base44.entities.PartTranslation.filter(
      { part_id: { $in: ids }, language },
      null,
      500,
      0,
      ['id', 'part_id', 'language', 'name', 'description', 'category', 'subcategory', 'specifications', 'status', 'translation_version']
    );

    // Legacy parts may predate the automatic translation pipeline. Backfill
    // only the visible result page, bounded by the server to prevent a bulk
    // translation job from being triggered by a normal search.
    const needsRefresh = ids.filter((id) => {
      const current = (translations || []).find((t) => String(t.part_id) === String(id));
      return !current || !current.name || !current.description || current.status === 'machine_draft';
    });
    if (needsRefresh.length) {
      try {
        await base44.functions.invoke('EnsurePartTranslations', {
          part_ids: needsRefresh.slice(0, 10),
          language
        });
        translations = await base44.entities.PartTranslation.filter(
          { part_id: { $in: ids }, language },
          null,
          500,
          0,
          ['id', 'part_id', 'language', 'name', 'description', 'category', 'subcategory', 'specifications', 'status', 'translation_version']
        );
      } catch {
        // The original Part remains the authoritative fallback if translation
        // generation is temporarily unavailable.
      }
    }

    const byPart = new Map((translations || []).map((t) => [String(t.part_id), t]));
    return results.map((result) => {
      const translation = byPart.get(String(result.id));
      if (!translation?.name) return result;
      const translatedSpecs = translation.specifications && typeof translation.specifications === 'object' ? translation.specifications : {};
      const localizedTopSpecs = Array.isArray(result.top_specs)
        ? result.top_specs.map((spec) => {
            const key = spec?.attribute || spec?.attribute_name || '';
            const localized = translatedSpecs[key];
            if (!localized) return spec;
            if (typeof localized === 'object' && localized !== null) {
              return { ...spec, attribute: localized.attribute || localized.label || key, value: localized.value ?? spec.value, unit: localized.unit ?? spec.unit };
            }
            return { ...spec, attribute: String(localized) };
          })
        : result.top_specs;
      return {
        ...result,
        original_name: result.original_name || result.title || result.product_name || result.name || result.product_identity?.short_description || '',
        original_description: result.original_description || result.description || '',
        title: translation.name,
        product_name: translation.name,
        description: translation.description || result.description || '',
        category: translation.category || result.category || '',
        subcategory: translation.subcategory || result.subcategory || '',
        top_specs: localizedTopSpecs,
        translation_status: translation.status || 'machine_draft',
        translation_version: translation.translation_version || 1,
        translation_language: language,
      };
    });
  } catch {
    return results;
  }
}
