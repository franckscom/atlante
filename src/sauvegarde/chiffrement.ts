// Chiffrement des sauvegardes avec la Web Crypto API (intégrée au navigateur, aucune bibliothèque).
//
// Schéma « à enveloppe » :
//   - les données sont chiffrées avec une clé aléatoire, la CLÉ DE DONNÉES (AES-GCM 256 bits) ;
//   - cette clé de données est elle-même chiffrée deux fois : une fois avec une clé tirée du
//     MOT DE PASSE, une fois avec une clé tirée de la CLÉ DE SECOURS.
// Ainsi l'un OU l'autre suffit pour ouvrir la sauvegarde. Sans aucun des deux : illisible, pour toujours.

const ITERATIONS = 600_000; // PBKDF2-SHA256 : ralentit volontairement les essais de mots de passe
const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

export function versBase64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

export function depuisBase64(texte: string): Uint8Array<ArrayBuffer> {
  const s = atob(texte);
  const octets = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) octets[i] = s.charCodeAt(i);
  return octets;
}

function alea(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

// --- Clé de secours -------------------------------------------------------

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // sans I, L, O, U, 0, 1 : pas de confusion à la relecture

/** Génère une clé de secours : 32 caractères en 8 groupes de 4 (environ 157 bits d'aléa). */
export function genererCleSecours(): string {
  const car: string[] = [];
  while (car.length < 32) {
    // Tirage sans biais : on rejette les octets hors du plus grand multiple de 30.
    for (const o of alea(64)) if (o < 240 && car.length < 32) car.push(ALPHABET[o % ALPHABET.length]);
  }
  return car.join('').replace(/(.{4})(?=.)/g, '$1-');
}

/** Forme canonique d'une clé de secours saisie à la main (majuscules, sans espaces ni tirets). */
export function nettoyerCleSecours(saisie: string): string {
  return saisie.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function cleSecoursValide(saisie: string): boolean {
  const c = nettoyerCleSecours(saisie);
  return c.length === 32 && [...c].every((x) => ALPHABET.includes(x));
}

/** Empreinte courte d'une clé de secours : permet de dire « quelle clé » sans la révéler. */
export async function empreinteCle(cle: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', encodeur.encode('atlante-empreinte:' + nettoyerCleSecours(cle))));
  return [...h.subarray(0, 4)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// --- Chiffrement ----------------------------------------------------------

/** Transforme un secret (mot de passe ou clé de secours) en clé AES, avec un sel aléatoire. */
async function deriver(secret: string, sel: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encodeur.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Une « enveloppe » : la clé de données chiffrée par un secret. */
export interface Enveloppe {
  sel: string;
  iv: string;
  donnees: string;
}

async function envelopper(cleDonnees: Uint8Array<ArrayBuffer>, secret: string, iterations: number): Promise<Enveloppe> {
  const sel = alea(16);
  const iv = alea(12);
  const cle = await deriver(secret, sel, iterations);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, cleDonnees));
  return { sel: versBase64(sel), iv: versBase64(iv), donnees: versBase64(chiffre) };
}

async function ouvrirEnveloppe(e: Enveloppe, secret: string, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const cle = await deriver(secret, depuisBase64(e.sel), iterations);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisBase64(e.iv) }, cle, depuisBase64(e.donnees)));
}

export interface ArchiveChiffree {
  format: 'atlante-sauvegarde';
  version_format: 1;
  creee_le: string;
  kdf: { nom: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  chiffrement: 'AES-GCM-256';
  enveloppe_mot_de_passe: Enveloppe;
  enveloppe_cle_secours: Enveloppe;
  /** Empreinte de la clé de secours utilisée (pas la clé). */
  empreinte_cle_secours: string;
  contenu: { iv: string; donnees: string };
}

export class ErreurDechiffrement extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurDechiffrement';
  }
}

/** En-tête protégé : toute modification du fichier, même hors des données, fait échouer l'ouverture. */
function entete(a: Pick<ArchiveChiffree, 'format' | 'version_format' | 'creee_le'>): Uint8Array<ArrayBuffer> {
  return encodeur.encode(`${a.format}|${a.version_format}|${a.creee_le}`);
}

export async function chiffrer(texteClair: string, motDePasse: string, cleSecours: string, iterations = ITERATIONS): Promise<ArchiveChiffree> {
  const cleDonneesBrute = alea(32);
  const cleDonnees = await crypto.subtle.importKey('raw', cleDonneesBrute, 'AES-GCM', false, ['encrypt']);
  const base = { format: 'atlante-sauvegarde' as const, version_format: 1 as const, creee_le: new Date().toISOString() };
  const iv = alea(12);
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: entete(base) }, cleDonnees, encodeur.encode(texteClair)),
  );
  return {
    ...base,
    kdf: { nom: 'PBKDF2', hash: 'SHA-256', iterations },
    chiffrement: 'AES-GCM-256',
    enveloppe_mot_de_passe: await envelopper(cleDonneesBrute, motDePasse, iterations),
    enveloppe_cle_secours: await envelopper(cleDonneesBrute, nettoyerCleSecours(cleSecours), iterations),
    empreinte_cle_secours: await empreinteCle(cleSecours),
    contenu: { iv: versBase64(iv), donnees: versBase64(chiffre) },
  };
}

/** Ouvre une archive avec le mot de passe OU la clé de secours. */
export async function dechiffrer(archive: ArchiveChiffree, secret: string, genre: 'mot_de_passe' | 'cle_secours'): Promise<string> {
  if (archive?.format !== 'atlante-sauvegarde') throw new ErreurDechiffrement("Ce fichier n'est pas une sauvegarde Atlante.");
  if (archive.version_format !== 1) throw new ErreurDechiffrement('Sauvegarde créée par une version plus récente de l\'app : mets Atlante à jour.');
  let cleDonneesBrute: Uint8Array<ArrayBuffer>;
  try {
    cleDonneesBrute =
      genre === 'mot_de_passe'
        ? await ouvrirEnveloppe(archive.enveloppe_mot_de_passe, secret, archive.kdf.iterations)
        : await ouvrirEnveloppe(archive.enveloppe_cle_secours, nettoyerCleSecours(secret), archive.kdf.iterations);
  } catch {
    throw new ErreurDechiffrement(genre === 'mot_de_passe' ? 'Mot de passe incorrect.' : 'Clé de secours incorrecte.');
  }
  try {
    const cleDonnees = await crypto.subtle.importKey('raw', cleDonneesBrute, 'AES-GCM', false, ['decrypt']);
    const clair = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: depuisBase64(archive.contenu.iv), additionalData: entete(archive) },
      cleDonnees,
      depuisBase64(archive.contenu.donnees),
    );
    return decodeur.decode(clair);
  } catch {
    // AES-GCM vérifie l'intégrité : un seul octet modifié suffit à faire échouer l'ouverture.
    throw new ErreurDechiffrement('Sauvegarde endommagée ou modifiée : contrôle d\'intégrité échoué.');
  }
}
