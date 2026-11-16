// Le « distant » de production : Supabase (API REST générée automatiquement à partir des tables).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NomTable } from '../modele/types';
import { ErreurDistante, type Distant, type LigneDistante } from './distant';

interface Reponse {
  error: { message: string; code?: string } | null;
  status: number;
}

/** Transforme une erreur Supabase en ErreurDistante classée par genre. */
function verifier(r: Reponse): void {
  if (!r.error) return;
  const { message, code } = r.error;
  if (code === '23505') throw new ErreurDistante('existe', message);
  // Statut 0 ou « Failed to fetch » : la requête n'est jamais arrivée.
  if (!r.status || /fetch|network|load failed/i.test(message)) throw new ErreurDistante('reseau', message);
  // 5xx (dont 540, « projet en pause ») : le serveur est là mais ne peut pas répondre.
  if (r.status >= 500) throw new ErreurDistante('serveur', message);
  if (r.status === 401 || code === 'PGRST301' || code === 'PGRST303') throw new ErreurDistante('auth', message);
  throw new ErreurDistante('autre', message);
}

/** Ramène les dates du serveur au même format que celles de l'app (ISO, millisecondes, « Z »). */
export function normaliserDates<T extends Record<string, unknown> | null>(ligne: T): T {
  if (!ligne) return ligne;
  const l = ligne as Record<string, unknown>;
  for (const c of ['created_at', 'updated_at', 'deleted_at']) {
    if (typeof l[c] === 'string') l[c] = new Date(l[c] as string).toISOString();
  }
  return ligne;
}

export class DistantSupabase implements Distant {
  constructor(private client: SupabaseClient) {}

  async lireDepuis(table: NomTable, rev: number, limite: number): Promise<LigneDistante[]> {
    const r = await this.client.from(table).select('*').gt('rev', rev).order('rev', { ascending: true }).limit(limite);
    verifier(r);
    return ((r.data ?? []) as LigneDistante[]).map(normaliserDates);
  }

  async lire(table: NomTable, id: string): Promise<LigneDistante | null> {
    const r = await this.client.from(table).select('*').eq('id', id).maybeSingle();
    verifier(r);
    return normaliserDates((r.data as LigneDistante) ?? null);
  }

  async inserer(table: NomTable, ligne: Record<string, unknown>): Promise<LigneDistante> {
    const r = await this.client.from(table).insert(ligne).select().single();
    verifier(r);
    return normaliserDates(r.data as LigneDistante);
  }

  async mettreAJour(table: NomTable, ligne: Record<string, unknown>, revAttendue: number): Promise<LigneDistante | null> {
    const { id, ...reste } = ligne;
    // Le filtre sur « rev » est le cœur de la détection de conflit : si un autre appareil
    // a écrit entre-temps, aucune ligne ne correspond et rien n'est écrasé.
    const r = await this.client.from(table).update(reste).eq('id', id as string).eq('rev', revAttendue).select();
    verifier(r);
    const lignes = (r.data ?? []) as LigneDistante[];
    return normaliserDates(lignes[0] ?? null);
  }
}
