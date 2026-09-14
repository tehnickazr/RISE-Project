// Sector name (as written in the Sheet) → canonical key → localized label.
//
// Each partner wrote sectors in their own language and their own granularity,
// which produced 36 distinct values across 108 scenarios: the same trade area
// appears as "Informatique – Numérique" and "Informática", and French alone
// split commerce into three and services into three. A student browsing in one
// language was shown headings in another.
//
// Mapping raw values onto a shared set fixes both at once and needs no change
// to the sheet. Unmapped values fall through unchanged, so adding content never
// breaks the catalogue — it just shows that sector untranslated until it is
// added here.
//
// Kit 2 arrived with a third vocabulary again, finer than Kit 1's: five separate
// `Industrie / …` values, four `Santé / …`, three `IT / …`, and `Bâtiment / BTP`
// beside the plain `Bâtiment` already mapped. Left alone that showed a French
// student 44 headings for 75 occupations, 35 of them untranslated, with the same
// trade area split several ways. Each new alias below was decided from the
// occupations actually filed under it, not from the label.

const CANONICAL = {
  construction: {
    sr: 'Građevinarstvo', en: 'Construction', fr: 'Bâtiment', pt: 'Construção',
  },
  metalwork: {
    sr: 'Mašinstvo i obrada metala', en: 'Metalwork and engineering',
    fr: 'Métallurgie et mécanique', pt: 'Metalomecânica',
  },
  automotive: {
    sr: 'Motorna vozila', en: 'Motor vehicles', fr: 'Automobile', pt: 'Automóvel',
  },
  transport: {
    sr: 'Saobraćaj i transport', en: 'Transport and logistics',
    fr: 'Transport et logistique', pt: 'Transporte e logística',
  },
  it: {
    sr: 'Informacione tehnologije', en: 'IT and digital',
    fr: 'Informatique – Numérique', pt: 'Informática',
  },
  electronics: {
    sr: 'Elektronika i automatika', en: 'Electronics and automation',
    fr: 'Électronique et automatisme', pt: 'Eletrónica e automação',
  },
  energy: {
    sr: 'Energetika', en: 'Energy', fr: 'Énergie', pt: 'Energia',
  },
  commerce: {
    sr: 'Trgovina', en: 'Retail and commerce', fr: 'Commerce', pt: 'Comércio',
  },
  hospitality: {
    sr: 'Ugostiteljstvo i turizam', en: 'Hospitality and tourism',
    fr: 'Hôtellerie – Restauration – Tourisme', pt: 'Hotelaria e turismo',
  },
  food: {
    sr: 'Prehrambena struka', en: 'Food trades', fr: 'Métiers de bouche',
    pt: 'Alimentação',
  },
  admin: {
    sr: 'Administracija i usluge', en: 'Administration and services',
    fr: 'Services et administration', pt: 'Gestão e administração',
  },
  industry: {
    sr: 'Industrijsko održavanje i kvalitet', en: 'Industrial maintenance and quality',
    fr: 'Maintenance industrielle et qualité', pt: 'Manutenção industrial e qualidade',
  },
  health: {
    sr: 'Zdravstvo', en: 'Health', fr: 'Santé', pt: 'Saúde',
  },
  education_social: {
    sr: 'Obrazovanje i socijalne usluge', en: 'Education and social services',
    fr: 'Éducation et services sociaux', pt: 'Educação e serviços sociais',
  },
  marketing: {
    sr: 'Marketing i komunikacije', en: 'Marketing and communication',
    fr: 'Marketing et communication', pt: 'Comunicação e marketing',
  },
  security: {
    sr: 'Bezbednost i odbrana', en: 'Security and defence',
    fr: 'Sécurité et défense', pt: 'Segurança e defesa',
  },
  design: {
    sr: 'Dizajn', en: 'Design', fr: 'Design', pt: 'Design',
  },
  // Added with Kit 2 — three trade areas with no home in the existing set.
  beauty: {
    sr: 'Frizerstvo i kozmetika', en: 'Hair and beauty',
    fr: 'Coiffure et esthétique', pt: 'Cabeleireiro e estética',
  },
  agriculture: {
    sr: 'Poljoprivreda i hortikultura', en: 'Agriculture and green spaces',
    fr: 'Agriculture et espaces verts', pt: 'Agricultura e espaços verdes',
  },
  real_estate: {
    sr: 'Nekretnine', en: 'Real estate', fr: 'Immobilier', pt: 'Imobiliário',
  },
};

// Raw sheet value → canonical key.
const ALIASES = {
  // construction
  'Bâtiment': 'construction',
  // metalwork
  'Mašinstvo i obrada metala': 'metalwork',
  'Metalomecânica': 'metalwork',
  // automotive
  'Motorna vozila': 'automotive',
  'Automóvel': 'automotive',
  // transport
  'Transport et logistique': 'transport',
  'Saobraćaj i transport': 'transport',
  // IT
  'Informatique – Numérique': 'it',
  'Informática': 'it',
  // electronics
  'Eletrónica e Automação': 'electronics',
  'Eletrónica e Telecomunicações': 'electronics',
  'Mehatronika i automatika': 'electronics',
  // energy
  'Eletricidade e Energia': 'energy',
  'Energias Renováveis': 'energy',
  'Energetika — nafta i gas': 'energy',
  // commerce
  'Commerce': 'commerce',
  'Commerce – Alimentation': 'commerce',
  'Commerce – Services': 'commerce',
  // hospitality
  'Hôtellerie - Restauration': 'hospitality',
  'Hôtellerie - Tourisme': 'hospitality',
  'Restauration': 'hospitality',
  'Turismo e Eventos': 'hospitality',
  // food trades
  'Alimentation – Métiers de bouche – Boulangerie': 'food',
  // administration and services
  'Services': 'admin',
  'Services / Administration – Accueil': 'admin',
  'Services – Propreté – Entretien': 'admin',
  'Gestão e Administração': 'admin',
  // industrial maintenance and quality
  'Manutenção Industrial': 'industry',
  'Qualidade e Processos': 'industry',
  // remaining one-to-one
  'Saúde': 'health',
  'Educação e Serviços Sociais': 'education_social',
  'Marketing i komunikacije': 'marketing',
  'Comunicação e Marketing': 'marketing',
  'Sécurité': 'security',
  'Défense': 'security',
  'Design': 'design',

  // ---- Kit 2 (French, August 2026). Grouped by the occupations filed under each.
  // construction — Chef de chantier is site management, Conducteur d'engins is
  // civil works; both belong with the building trades rather than beside them.
  'Bâtiment / BTP': 'construction',
  'Travaux publics': 'construction',
  // metalwork — Chaudronnier, Soudeur, Usineur
  'Industrie / Métallurgie': 'metalwork',
  'Industrie / Usinage': 'metalwork',
  // electronics — Électromécanicien
  'Industrie / Électromécanique': 'electronics',
  // industrial maintenance — Conducteur de ligne, Technicien de maintenance
  'Industrie / Production': 'industry',
  'Industrie / Maintenance': 'industry',
  // energy — Technicien CVC: heating and ventilation, a building-services trade
  'Génie climatique': 'energy',
  // transport — Conducteur routier, Magasinier, Préparateur de commandes
  'Transport / Logistique': 'transport',
  // IT — Développeur, Technicien réseaux, Helpdesk, Data Analyst, Fibre optique
  'IT / ICT': 'it',
  'IT / Data': 'it',
  'IT / Télécoms': 'it',
  // commerce — Employé de commerce, Chef de rayon, Conseiller de vente, Technico-commercial
  'Commerce / Distribution': 'commerce',
  'Commerce / Vente': 'commerce',
  'Commerce / Vente B2B': 'commerce',
  // hospitality — Commis de cuisine, Employé d'étage
  'Hôtellerie-Restauration': 'hospitality',
  'Hôtellerie': 'hospitality',
  // food trades — Boucher
  'Métiers de bouche': 'food',
  // administration — Assistant administratif/de direction, Chargé de recrutement,
  // Gestionnaire de paie
  'Administration / Gestion': 'admin',
  'Administration / RH / Paie': 'admin',
  'Ressources humaines': 'admin',
  // health — Aide-soignant, Ambulancier, Assistant dentaire, Secrétaire médical,
  // Auxiliaire de vie. Care work sits with health, as it does for the Serbian
  // and Portuguese sets.
  'Santé / Médico-social': 'health',
  'Santé / Transport sanitaire': 'health',
  'Santé / Dentaire': 'health',
  'Santé / Administration médico-sociale': 'health',
  'Services à la personne / Médico-social': 'health',
  // education and social services — Accompagnant Éducatif et Social, Éducateur
  // spécialisé, Animateur socio-culturel, Accompagnant éducatif petite enfance
  'Social / Médico-social': 'education_social',
  'Animation / Social / Culture': 'education_social',
  'Petite enfance': 'education_social',
  // security — Agent de sécurité
  'Sécurité privée': 'security',
  // beauty — Coiffeur, Esthéticien
  'Coiffure / Beauté': 'beauty',
  'Beauté / Esthétique': 'beauty',
  // agriculture and green spaces — Ouvrier agricole, Ouvrier paysagiste
  'Agriculture': 'agriculture',
  'Espaces verts / Paysage': 'agriculture',
  // real estate — Agent immobilier
  'Immobilier': 'real_estate',
};

/**
 * Localized sector heading. Accepts either a raw sheet value or a canonical
 * key, so callers can group by key and label the group with the same function.
 * Unmapped sectors are shown as written.
 */
export function sectorLabel(sector, language) {
  const raw = (sector ?? '').trim();
  if (!raw) return '';
  const entry = CANONICAL[raw] ?? CANONICAL[ALIASES[raw]];
  if (!entry) return raw;
  return entry[language] ?? entry.en ?? raw;
}

/** Canonical key, for grouping. Falls back to the raw value. */
export function sectorKey(sector) {
  const raw = (sector ?? '').trim();
  return ALIASES[raw] ?? raw;
}
