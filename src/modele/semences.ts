// Contenu de départ : créé une seule fois, au premier lancement. Tout est modifiable ensuite.

export const DOMAINES_DE_DEPART = [
  'Philosophie et pensée critique',
  'Politique, géopolitique et relations internationales',
  'Sciences dures',
  'Sociologie',
  'Sémiologie',
  'Technologie et IA',
  'Littérature, arts, rhétorique et culture',
  'Marketing, communication et stratégie',
  'Économie et management',
  'Idéologies et doctrines',
  'Think tanks et institutions',
  'Histoire, civilisations et archéologie',
  'Psychologie et sciences cognitives',
  'Religions',
];

/** [nom, nom lu dans l'autre sens] */
export const TYPES_RELATION_DE_DEPART: [string, string][] = [
  ['a écrit', 'écrit par'],
  ['critique', 'critiqué par'],
  ["s'inspire de", 'a inspiré'],
  ['appartient à', 'comprend'],
  ['cité dans', 'cite'],
  ['a fondé', 'fondé par'],
  ['a participé à', 'a eu pour participant'],
  ["s'oppose à", "s'oppose à"],
  ['développe', 'développé par'],
  ['est lié à', 'est lié à'],
];
