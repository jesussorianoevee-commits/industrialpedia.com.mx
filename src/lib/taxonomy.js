import { Wind, Radar, Bot, Cpu, Cog, Package } from 'lucide-react';

// Taxonomía de áreas industriales. Esta es estructura de taxonomía (no cobertura):
// define las áreas y tipos de subcategorías que el Knowledge Core puede clasificar.
// Los conteos de refacciones se calculan desde la base real (entity Part), no se hardcodean.
export const AREAS = [
  {
    id: 'neumatica',
    name: 'Neumática',
    icon: Wind,
    description: 'Válvulas, cilindros, grippers y sistemas de aire comprimido.',
    subcategories: [
      'Accesorios para válvulas', 'Actuador eléctrico lineal', 'Actuadores de proceso',
      'Amortiguadores', 'Cabezas de dosificación', 'Cables de conexión'
    ],
    moreCount: 68
  },
  {
    id: 'sensores',
    name: 'Sensores',
    icon: Radar,
    description: 'Sensores inductivos, capacitivos, fotoeléctricos y codificadores.',
    subcategories: [
      'Cajas de switches', 'Sensores capacitivos', 'Sensores de fuerza',
      'Sensores inductivos', 'Sensores magnéticos', 'Sensores ópticos'
    ],
    moreCount: 1
  },
  {
    id: 'robotica',
    name: 'Robótica',
    icon: Bot,
    description: 'Servomotores, reductores y componentes para celdas robóticas.',
    subcategories: [
      'Actuador eléctrico guiado', 'Actuador eléctrico lineal', 'Actuadores eléctricos',
      'Cobots colaborativos', 'Interfaces de operador', 'Módulos de sujeción y giro'
    ],
    moreCount: 10
  },
  {
    id: 'electronica-control',
    name: 'Electrónica / Control',
    icon: Cpu,
    description: 'PLC, HMI, tarjetas de E/S y componentes electrónicos.',
    subcategories: [
      'Accesorios para cabezas de dosificación', 'ArrowBox', 'Cables de conexión universales',
      'Controladores', 'Dispositivos aislados y a prueba de agua', 'Dispositivos con seguro de media vuelta'
    ],
    moreCount: 20
  },
  {
    id: 'mecanica-transmision',
    name: 'Mecánica / Transmisión',
    icon: Cog,
    description: 'Acoplamientos, rodamientos, correas y elementos de transmisión mecánica.',
    subcategories: [
      'Acoplamientos', 'Rodamientos', 'Correas y poleas', 'Engranajes', 'Ejes y chavetas', 'Piñones'
    ],
    moreCount: 24
  },
  {
    id: 'instrumentacion-medicion',
    name: 'Instrumentación / Medición',
    icon: Radar,
    description: 'Instrumentos para medir, registrar, calibrar y verificar variables de proceso.',
    subcategories: ['Medidores de flujo', 'Medición de vibración', 'Registradores de datos', 'Balanzas', 'Termómetros', 'Calibradores'],
    moreCount: 0
  },
  {
    id: 'laboratorio-cientifico',
    name: 'Laboratorio / Científico',
    icon: Package,
    description: 'Equipos, consumibles y accesorios de laboratorio para preparación, análisis y manejo de muestras.',
    subcategories: ['Manejo de líquidos', 'Mezcla y agitación', 'Vidriería', 'Preparación de muestras', 'Tamizado', 'Molienda'],
    moreCount: 0
  },
  {
    id: 'fluidos-bombeo',
    name: 'Fluidos / Bombeo',
    icon: Wind,
    description: 'Bombas, cabezales, tubos y componentes para transferencia y manejo de fluidos.',
    subcategories: ['Bombas', 'Bombas de proceso', 'Tubos y mangueras', 'Cabezas de bomba', 'Accesorios de bombeo'],
    moreCount: 0
  },
  {
    id: 'herramientas-mro',
    name: 'Herramientas / MRO',
    icon: Cog,
    description: 'Herramientas, máquinas de taller y elementos utilizados para mantenimiento y fabricación.',
    subcategories: ['Corte', 'Taladrado', 'Desbaste', 'Mecanizado', 'Prensas', 'Herramientas manuales'],
    moreCount: 0
  },
  {
    id: 'soldadura-union',
    name: 'Soldadura / Unión',
    icon: Cpu,
    description: 'Equipos y consumibles para soldadura, retrabajo y procesos de unión.',
    subcategories: ['Soldadores', 'Consumibles de soldadura', 'Electrodos', 'Extracción de humos', 'Accesorios'],
    moreCount: 0
  },
  {
    id: 'consumibles-mro',
    name: 'Consumibles / MRO',
    icon: Package,
    description: 'Consumibles, abrasivos, EPP y accesorios de mantenimiento que no requieren un área de proceso específica.',
    subcategories: ['EPP', 'Abrasivos', 'Cintas y adhesivos', 'Filtros', 'Accesorios de mantenimiento'],
    moreCount: 0
  },
  {
    id: 'proceso-maquinaria',
    name: 'Proceso / Maquinaria',
    icon: Cog,
    description: 'Maquinaria y equipos de proceso que no pertenecen a una disciplina técnica específica.',
    subcategories: ['Mezclado', 'Molienda', 'Trituración', 'Prensado', 'Procesamiento'],
    moreCount: 0
  },
  {
    id: 'otras-refacciones',
    name: 'Otras refacciones',
    icon: Package,
    description: 'Refacciones que todavía no pueden identificarse con evidencia suficiente.',
    subcategories: [],
    moreCount: 0,
    statsKey: 'sin_clasificar'
  }
];

export const TOTAL_TYPES = 129;
export const POPULAR_TAGS = ['Balluff', 'Eaton', 'Aubo'];

const AREA_I18N = {
  es: {},
  en: {
    'instrumentacion-medicion': { name: 'Instrumentation / Measurement', description: 'Instruments for measuring, recording, calibrating and verifying process variables.' },
    'laboratorio-cientifico': { name: 'Laboratory / Scientific', description: 'Laboratory equipment, supplies and accessories for sample preparation, analysis and handling.' },
    'fluidos-bombeo': { name: 'Fluids / Pumping', description: 'Pumps, heads, tubing and components for fluid transfer and handling.' },
    'herramientas-mro': { name: 'Tools / MRO', description: 'Tools, workshop machines and maintenance/manufacturing equipment.' },
    'soldadura-union': { name: 'Welding / Joining', description: 'Equipment and consumables for welding, rework and joining processes.' },
    'consumibles-mro': { name: 'Consumables / MRO', description: 'Consumables, abrasives, PPE and maintenance accessories.' },
    'proceso-maquinaria': { name: 'Process / Machinery', description: 'Process machinery and equipment without a more specific technical discipline.' },

    neumatica: { name: 'Pneumatics', description: 'Valves, cylinders, grippers and compressed-air systems.' },
    sensores: { name: 'Sensors', description: 'Inductive, capacitive, photoelectric sensors and encoders.' },
    robotica: { name: 'Robotics', description: 'Servo motors, gearboxes and components for robotic cells.' },
    'electronica-control': { name: 'Electronics / Control', description: 'PLC, HMI, I/O boards and electronic components.' },
    'mecanica-transmision': { name: 'Mechanical / Transmission', description: 'Couplings, bearings, belts and mechanical transmission elements.' },
    'otras-refacciones': { name: 'Other spare parts', description: 'Available spare parts that do not yet have enough technical classification for an area.' }
  },
  de: {
    'instrumentacion-medicion': { name: 'Messtechnik / Instrumentierung', description: 'Mess-, Prüf-, Kalibrier- und Aufzeichnungsinstrumente für Prozessgrößen.' },
    'laboratorio-cientifico': { name: 'Labor / Wissenschaft', description: 'Laborgeräte, Verbrauchsmaterialien und Zubehör für Probenvorbereitung und Analyse.' },
    'fluidos-bombeo': { name: 'Fluide / Pumpen', description: 'Pumpen, Pumpenköpfe, Schläuche und Komponenten für Flüssigkeitstransport.' },
    'herramientas-mro': { name: 'Werkzeuge / MRO', description: 'Werkzeuge, Werkstattmaschinen und Instandhaltungsausrüstung.' },
    'soldadura-union': { name: 'Schweißen / Fügen', description: 'Ausrüstung und Verbrauchsmaterialien zum Schweißen und Fügen.' },
    'consumibles-mro': { name: 'Verbrauchsmaterial / MRO', description: 'Verbrauchsmaterialien, Schleifmittel, PSA und Instandhaltungszubehör.' },
    'proceso-maquinaria': { name: 'Prozess / Maschinen', description: 'Prozessmaschinen und Anlagen ohne spezifischere technische Disziplin.' },

    neumatica: { name: 'Pneumatik', description: 'Ventile, Zylinder, Greifer und Druckluftsysteme.' },
    sensores: { name: 'Sensoren', description: 'Induktive, kapazitive, photoelektrische Sensoren und Encoder.' },
    robotica: { name: 'Robotik', description: 'Servomotoren, Getriebe und Komponenten für Roboterzellen.' },
    'electronica-control': { name: 'Elektronik / Steuerung', description: 'SPS, HMI, E/A-Karten und elektronische Komponenten.' },
    'mecanica-transmision': { name: 'Mechanik / Antriebstechnik', description: 'Kupplungen, Lager, Riemen und mechanische Übertragungselemente.' },
    'otras-refacciones': { name: 'Andere Ersatzteile', description: 'Verfügbare Ersatzteile ohne ausreichende technische Klassifizierung für einen Bereich.' }
  },
  fr: {
    'instrumentacion-medicion': { name: 'Instrumentation / Mesure', description: 'Instruments de mesure, d’enregistrement et d’étalonnage des variables de procédé.' },
    'laboratorio-cientifico': { name: 'Laboratoire / Scientifique', description: 'Équipements, consommables et accessoires de laboratoire pour la préparation et l’analyse.' },
    'fluidos-bombeo': { name: 'Fluides / Pompage', description: 'Pompes, têtes, tubes et composants pour le transfert des fluides.' },
    'herramientas-mro': { name: 'Outils / MRO', description: 'Outils, machines d’atelier et équipements de maintenance.' },
    'soldadura-union': { name: 'Soudage / Assemblage', description: 'Équipements et consommables de soudage et d’assemblage.' },
    'consumibles-mro': { name: 'Consommables / MRO', description: 'Consommables, abrasifs, EPI et accessoires de maintenance.' },
    'proceso-maquinaria': { name: 'Procédé / Machines', description: 'Machines et équipements de procédé sans discipline technique plus précise.' },

    neumatica: { name: 'Pneumatique', description: 'Vannes, vérins, préhenseurs et systèmes d’air comprimé.' },
    sensores: { name: 'Capteurs', description: 'Capteurs inductifs, capacitifs, photoélectriques et codeurs.' },
    robotica: { name: 'Robotique', description: 'Servomoteurs, réducteurs et composants pour cellules robotisées.' },
    'electronica-control': { name: 'Électronique / Contrôle', description: 'API, IHM, cartes E/S et composants électroniques.' },
    'mecanica-transmision': { name: 'Mécanique / Transmission', description: 'Accouplements, roulements, courroies et éléments de transmission mécanique.' },
    'otras-refacciones': { name: 'Autres pièces', description: 'Pièces disponibles qui ne disposent pas encore d’une classification technique suffisante.' }
  },
  zh: {
    'instrumentacion-medicion': { name: '仪器 / 测量', description: '用于测量、记录、校准和验证过程变量的仪器。' },
    'laboratorio-cientifico': { name: '实验室 / 科学', description: '用于样品制备、分析和处理的实验室设备、耗材及附件。' },
    'fluidos-bombeo': { name: '流体 / 泵送', description: '用于流体输送和处理的泵、泵头、管路及组件。' },
    'herramientas-mro': { name: '工具 / MRO', description: '维修、加工和制造使用的工具及车间设备。' },
    'soldadura-union': { name: '焊接 / 连接', description: '焊接、返修和连接工艺所用设备及耗材。' },
    'consumibles-mro': { name: '耗材 / MRO', description: '耗材、磨料、个人防护用品和维修附件。' },
    'proceso-maquinaria': { name: '工艺 / 机械设备', description: '不属于更具体技术领域的工艺机械和设备。' },

    neumatica: { name: '气动', description: '阀、气缸、夹爪和压缩空气系统。' },
    sensores: { name: '传感器', description: '电感式、电容式、光电传感器和编码器。' },
    robotica: { name: '机器人技术', description: '伺服电机、减速机和机器人单元组件。' },
    'electronica-control': { name: '电子 / 控制', description: 'PLC、HMI、I/O 模块和电子元件。' },
    'mecanica-transmision': { name: '机械 / 传动', description: '联轴器、轴承、皮带及机械传动元件。' },
    'otras-refacciones': { name: '其他备件', description: '尚未具备足够技术分类以归入具体领域的可用备件。' }
  }
};

const TERM_I18N = {
  'Accesorios para válvulas': { en: 'Valve accessories', de: 'Ventilzubehör', fr: 'Accessoires de vannes', zh: '阀门附件' },
  'Actuador eléctrico lineal': { en: 'Linear electric actuator', de: 'Elektrischer Linearantrieb', fr: 'Actionneur électrique linéaire', zh: '电动直线执行器' },
  'Actuadores de proceso': { en: 'Process actuators', de: 'Prozessantriebe', fr: 'Actionneurs de process', zh: '过程执行器' },
  'Amortiguadores': { en: 'Shock absorbers', de: 'Dämpfer', fr: 'Amortisseurs', zh: '缓冲器' },
  'Cabezas de dosificación': { en: 'Dosing heads', de: 'Dosierköpfe', fr: 'Têtes de dosage', zh: '计量头' },
  'Cables de conexión': { en: 'Connection cables', de: 'Anschlusskabel', fr: 'Câbles de connexion', zh: '连接电缆' },
  'Cajas de switches': { en: 'Switch boxes', de: 'Schalterboxen', fr: 'Boîtiers de commutation', zh: '开关盒' },
  'Sensores capacitivos': { en: 'Capacitive sensors', de: 'Kapazitive Sensoren', fr: 'Capteurs capacitifs', zh: '电容式传感器' },
  'Sensores de fuerza': { en: 'Force sensors', de: 'Kraftsensoren', fr: 'Capteurs de force', zh: '力传感器' },
  'Sensores inductivos': { en: 'Inductive sensors', de: 'Induktive Sensoren', fr: 'Capteurs inductifs', zh: '电感式传感器' },
  'Sensores magnéticos': { en: 'Magnetic sensors', de: 'Magnetische Sensoren', fr: 'Capteurs magnétiques', zh: '磁性传感器' },
  'Sensores ópticos': { en: 'Optical sensors', de: 'Optische Sensoren', fr: 'Capteurs optiques', zh: '光学传感器' },
  'Actuador eléctrico guiado': { en: 'Guided electric actuator', de: 'Geführter elektrischer Antrieb', fr: 'Actionneur électrique guidé', zh: '导向电动执行器' },
  'Actuadores eléctricos': { en: 'Electric actuators', de: 'Elektrische Antriebe', fr: 'Actionneurs électriques', zh: '电动执行器' },
  'Cobots colaborativos': { en: 'Collaborative cobots', de: 'Kollaborative Cobots', fr: 'Cobots collaboratifs', zh: '协作机器人' },
  'Interfaces de operador': { en: 'Operator interfaces', de: 'Bedienerschnittstellen', fr: 'Interfaces opérateur', zh: '操作员界面' },
  'Módulos de sujeción y giro': { en: 'Gripping and rotary modules', de: 'Greif- und Drehmodule', fr: 'Modules de préhension et rotation', zh: '夹持与旋转模块' },
  'Controladores': { en: 'Controllers', de: 'Steuerungen', fr: 'Contrôleurs', zh: '控制器' },
  'Dispositivos aislados y a prueba de agua': { en: 'Isolated and waterproof devices', de: 'Isolierte und wasserdichte Geräte', fr: 'Dispositifs isolés et étanches', zh: '隔离及防水设备' },
  'Dispositivos con seguro de media vuelta': { en: 'Half-turn locking devices', de: 'Halbdrehverriegelungen', fr: 'Dispositifs à verrouillage quart de tour', zh: '半转锁定装置' },
  'Cables de conexión universales': { en: 'Universal connection cables', de: 'Universelle Anschlusskabel', fr: 'Câbles de connexion universels', zh: '通用连接电缆' },
  'Acoplamientos': { en: 'Couplings', de: 'Kupplungen', fr: 'Accouplements', zh: '联轴器' },
  'Rodamientos': { en: 'Bearings', de: 'Lager', fr: 'Roulements', zh: '轴承' },
  'Correas y poleas': { en: 'Belts and pulleys', de: 'Riemen und Riemenscheiben', fr: 'Courroies et poulies', zh: '皮带和皮带轮' },
  'Engranajes': { en: 'Gears', de: 'Zahnräder', fr: 'Engrenages', zh: '齿轮' },
  'Ejes y chavetas': { en: 'Shafts and keys', de: 'Wellen und Passfedern', fr: 'Arbres et clavettes', zh: '轴和键' },
  'Piñones': { en: 'Sprockets', de: 'Ritzel', fr: 'Pignons', zh: '链轮' }
};

export function localizeTaxonomyTerm(term, language = 'es') {
  return TERM_I18N[term]?.[language] || term;
}

export function getLocalizedArea(area, language = 'es') {
  const localized = AREA_I18N[language]?.[area.id];
  const localizedSubcategories = area.subcategories?.map((term) => localizeTaxonomyTerm(term, language));
  if (!localized && language === 'es') return area;
  return { ...area, ...(localized || {}), subcategories: localizedSubcategories || area.subcategories };
}