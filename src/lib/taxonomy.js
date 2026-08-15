import { Wind, Radar, Bot, Cpu, Cog } from 'lucide-react';

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
  }
];

export const TOTAL_TYPES = 129;
export const POPULAR_TAGS = ['Balluff', 'Eaton', 'Aubo'];