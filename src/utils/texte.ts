// Petits outils sur le texte et les dates.

/** Met en minuscules, retire les accents et la ponctuation : « Été 1936 ! » devient « ete 1936 ». */
export function normaliser(texte: string): string {
  return (texte ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Date du jour au format JJ.MM.AA, utilisée dans les noms de fichiers. */
export function dateFichier(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/** Date lisible : « 15/11/2026 à 14:05 ». */
export function dateLisible(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Première année (4 chiffres) trouvée dans une date libre, ou null. */
export function anneeDe(date: string): number | null {
  const m = /(\d{4})/.exec(date ?? '');
  return m ? Number(m[1]) : null;
}

/** Nom de fichier sûr à partir d'un titre. */
export function nomFichierSur(titre: string): string {
  const base = normaliser(titre).replace(/ /g, '-').slice(0, 60);
  return base || 'sans-titre';
}

/** Comparaison profonde et stable de deux valeurs (l'ordre des clés d'un objet ne compte pas). */
export function egal(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
