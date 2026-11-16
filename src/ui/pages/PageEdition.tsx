// Création et modification d'une fiche.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { bd } from '../../donnees/db';
import { creer, fabriquerFiche, modifier } from '../../donnees/depot';
import { chercherDoublons } from '../../donnees/doublons';
import { CHAMPS_PAR_TYPE, TYPES_FICHE, type TypeFiche } from '../../modele/types';
import { useDonnees } from '../donnees';

export function PageEdition() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const naviguer = useNavigate();
  const { pret, ctx, corpus, domaines } = useDonnees();
  const existante = id ? ctx.fiches.get(id) : undefined;
  const typeDemande = (params.get('type') ?? 'note') as TypeFiche;

  const [type, setType] = useState<TypeFiche>(typeDemande in TYPES_FICHE ? typeDemande : 'note');
  const [titre, setTitre] = useState('');
  const [auteur, setAuteur] = useState('');
  const [date, setDate] = useState('');
  const [url, setUrl] = useState('');
  const [contenu, setContenu] = useState('');
  const [domaineIds, setDomaineIds] = useState<string[]>(params.get('domaine') ? [params.get('domaine')!] : []);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [charge, setCharge] = useState(!id);
  const [erreur, setErreur] = useState('');

  // En modification : on remplit le formulaire une seule fois, à l'arrivée des données.
  useEffect(() => {
    if (existante && !charge) {
      setType(existante.type);
      setTitre(existante.titre);
      setAuteur(existante.auteur);
      setDate(existante.date);
      setUrl(existante.url);
      setContenu(existante.contenu);
      setDomaineIds(existante.domaine_ids);
      setChamps(existante.champs ?? {});
      setCharge(true);
    }
  }, [existante, charge]);

  const doublons = useMemo(
    () => (titre.trim().length >= 3 || url.trim() ? chercherDoublons({ id, titre, auteur, url }, corpus.fiches) : []),
    [id, titre, auteur, url, corpus],
  );

  if (id && pret && !existante) return <p>Fiche introuvable. <Link to="/fiches">Retour aux fiches</Link></p>;
  if (!charge) return <p className="doux">Chargement…</p>;

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) return setErreur('Le titre est obligatoire.');
    // On ne garde que les champs propres au type choisi.
    const champsUtiles: Record<string, string> = {};
    for (const c of CHAMPS_PAR_TYPE[type]) if (champs[c.cle]?.trim()) champsUtiles[c.cle] = champs[c.cle].trim();
    const donnees = { type, titre: titre.trim(), auteur: auteur.trim(), date: date.trim(), url: url.trim(), contenu, domaine_ids: domaineIds, champs: champsUtiles };
    if (id) {
      await modifier(bd, 'fiches', id, donnees);
      naviguer(`/fiche/${id}`);
    } else {
      const f = await creer(bd, 'fiches', { ...fabriquerFiche(type, donnees.titre), ...donnees });
      naviguer(`/fiche/${f.id}`, { replace: true });
    }
  };

  const libelleContenu = type === 'citation' ? 'Texte de la citation' : type === 'dossier' ? 'Présentation du dossier' : 'Contenu (Markdown accepté)';

  return (
    <form className="etroit" onSubmit={enregistrer}>
      <h1>{id ? 'Modifier la fiche' : 'Nouvelle fiche'}</h1>
      <div className="grille">
        <div className="champ">
          <label htmlFor="e-type">Type</label>
          <select id="e-type" value={type} onChange={(e) => setType(e.target.value as TypeFiche)}>
            {Object.entries(TYPES_FICHE).map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
          </select>
        </div>
      </div>
      <div className="champ">
        <label htmlFor="e-titre">{type === 'personne' ? 'Nom' : 'Titre'}</label>
        <input id="e-titre" type="text" value={titre} onChange={(e) => { setTitre(e.target.value); setErreur(''); }} autoFocus={!id} required />
      </div>
      {type !== 'personne' && type !== 'dossier' && (
        <div className="grille">
          <div className="champ">
            <label htmlFor="e-auteur">Auteur</label>
            <input id="e-auteur" type="text" value={auteur} onChange={(e) => setAuteur(e.target.value)} />
          </div>
          <div className="champ">
            <label htmlFor="e-date">Date (libre : 1967, 2024-05-01…)</label>
            <input id="e-date" type="text" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}
      {type !== 'dossier' && (
        <div className="champ">
          <label htmlFor="e-url">URL</label>
          <input id="e-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
      )}
      {CHAMPS_PAR_TYPE[type].length > 0 && (
        <div className="grille">
          {CHAMPS_PAR_TYPE[type].map((c) => (
            <div className="champ" key={c.cle}>
              <label htmlFor={'e-' + c.cle}>{c.libelle}</label>
              <input id={'e-' + c.cle} type="text" value={champs[c.cle] ?? ''} onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      <div className="champ">
        <label htmlFor="e-contenu">{libelleContenu}</label>
        <textarea id="e-contenu" className="grand" value={contenu} onChange={(e) => setContenu(e.target.value)} />
      </div>
      <fieldset className="champ" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
        <legend className="doux petit" style={{ padding: 0, marginBottom: 4 }}>Domaines (plusieurs possibles)</legend>
        <div className="cases">
          {domaines.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={domaineIds.includes(d.id)}
                onChange={(e) => setDomaineIds(e.target.checked ? [...domaineIds, d.id] : domaineIds.filter((x) => x !== d.id))}
              />
              {d.nom}
            </label>
          ))}
        </div>
      </fieldset>

      {doublons.length > 0 && (
        <div className="bandeau attention" role="status">
          <strong>Doublon possible.</strong> {doublons.length > 1 ? 'Ces fiches ressemblent' : 'Cette fiche ressemble'} à celle que tu saisis :
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {doublons.slice(0, 5).map((d) => (
              <li key={d.fiche.id}>
                <Link to={`/fiche/${d.fiche.id}`} target="_blank">{d.fiche.titre || 'Sans titre'}</Link> ({TYPES_FICHE[d.fiche.type]}, {d.raison})
              </li>
            ))}
          </ul>
        </div>
      )}
      {erreur && <div className="bandeau danger" role="alert">{erreur}</div>}
      <div className="actions">
        <button className="bouton principal" type="submit">
          {id ? 'Enregistrer' : doublons.length ? 'Créer quand même' : 'Créer la fiche'}
        </button>
        <Link className="bouton" to={id ? `/fiche/${id}` : '/fiches'}>Annuler</Link>
      </div>
    </form>
  );
}
