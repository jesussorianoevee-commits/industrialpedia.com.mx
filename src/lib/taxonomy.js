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
    id: 'otras-refacciones',
    name: 'Otras refacciones',
    icon: Package,
    description: 'Refacciones disponibles que aún no cuentan con una clasificación técnica suficiente para asignarlas a un área.',
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
    neumatica: { name: 'Pneumatics', description: 'Valves, cylinders, grippers and compressed-air systems.' },
    sensores: { name: 'Sensors', description: 'Inductive, capacitive, photoelectric sensors and encoders.' },
    robotica: { name: 'Robotics', description: 'Servo motors, gearboxes and components for robotic cells.' },
    'electronica-control': { name: 'Electronics / Control', description: 'PLC, HMI, I/O boards and electronic components.' },
    'mecanica-transmision': { name: 'Mechanical / Transmission', description: 'Couplings, bearings, belts and mechanical transmission elements.' },
    'otras-refacciones': { name: 'Other spare parts', description: 'Available spare parts that do not yet have enough technical classification for an area.' }
  },
  de: {
    neumatica: { name: 'Pneumatik', description: 'Ventile, Zylinder, Greifer und Druckluftsysteme.' },
    sensores: { name: 'Sensoren', description: 'Induktive, kapazitive, photoelektrische Sensoren und Encoder.' },
    robotica: { name: 'Robotik', description: 'Servomotoren, Getriebe und Komponenten für Roboterzellen.' },
    'electronica-control': { name: 'Elektronik / Steuerung', description: 'SPS, HMI, E/A-Karten und elektronische Komponenten.' },
    'mecanica-transmision': { name: 'Mechanik / Antriebstechnik', description: 'Kupplungen, Lager, Riemen und mechanische Übertragungselemente.' },
    'otras-refacciones': { name: 'Andere Ersatzteile', description: 'Verfügbare Ersatzteile ohne ausreichende technische Klassifizierung für einen Bereich.' }
  },
  fr: {
    neumatica: { name: 'Pneumatique', description: 'Vannes, vérins, préhenseurs et systèmes d’air comprimé.' },
    sensores: { name: 'Capteurs', description: 'Capteurs inductifs, capacitifs, photoélectriques et codeurs.' },
    robotica: { name: 'Robotique', description: 'Servomoteurs, réducteurs et composants pour cellules robotisées.' },
    'electronica-control': { name: 'Électronique / Contrôle', description: 'API, IHM, cartes E/S et composants électroniques.' },
    'mecanica-transmision': { name: 'Mécanique / Transmission', description: 'Accouplements, roulements, courroies et éléments de transmission mécanique.' },
    'otras-refacciones': { name: 'Autres pièces', description: 'Pièces disponibles qui ne disposent pas encore d’une classification technique suffisante.' }
  },
  zh: {
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