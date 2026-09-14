// Profession key (as stored in the Sheet) → localized display name.
// Add entries here when new professions are introduced in the sheet.
const PROFESSIONS = {
  'Service Technician': {
    sr: 'Serviser',
    en: 'Service Technician',
    fr: 'Technicien de service',
    pt: 'Técnico de assistência',
  },
  'Junior Brand Manager': {
    sr: 'Junior brend menadžer',
    en: 'Junior Brand Manager',
    fr: 'Junior Brand Manager',
    pt: 'Gestor de marca júnior',
  },
};

export function professionLabel(key, lang) {
  const entry = PROFESSIONS[key];
  if (!entry) return key;
  return entry[lang] ?? entry.en ?? key;
}
