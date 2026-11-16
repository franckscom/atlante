// Fiche détaillée : contenu, affirmations avec statut, relations, dossiers.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { bd } from '../../donnees/db';
import { creer, modifier, supprimerFiche, supprimerSimple } from '../../donnees/depot';
import { relationsDe } from '../../exports/contexte';
import { enregistrerFichier } from '../../exports/fichiers';
import { ficheEnMarkdown, nomsDeFichiers } from '../../exports/markdown';
import { preparerPourClaude } from '../../ia/preparer';
import { CHAMPS_PAR_TYPE, STATUTS, TYPES_FICHE, type Affirmation, type Fiche, type Statut } from '../../modele/types';
import { dateFichier, dateLisible, nomFichierSur } from '../../utils/texte';
import { confirmer } from '../composants/Confirmation';
import { Markdown } from '../composants/Markdown';
import { SelecteurFiche } from '../composants/SelecteurFiche';
import { useDonnees } from '../donnees';

export function PageFiche() {
  const { id = '' } = useParams();
  const naviguer = useNavigate();
  const { pret, ctx, domaines } = useDonnees();
  const fiche = ctx.fiches.get(id);
  const [texteClaude, setTexteClaude] = useState<{ texte: string; copie: boolean } | null>(null);

  if (!pret) return <p className="doux">Chargement…</p>;
  if (!fiche) return <p>Cette fiche n'existe pas ou a été supprimée. <Link to="/fiches">Retour aux fiches</Link></p>;

  const supprimer = async () => {
    const ok = await confirmer({
      titre: 'Supprimer cette fiche ?',
      message: `« ${fiche.titre} » part à la corbeille, avec ses relations et ses affirmations. Tu pourras la restaurer depuis Réglages.`,
      bouton: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await supprimerFiche(bd, fiche.id);
    naviguer('/fiches');
  };

  const preparer = async () => {
    const texte = preparerPourClaude(ctx, fiche.id);
    let copie = false;
    try {
      await navigator.clipboard.writeText(texte);
      copie = true;
    } catch {
      // Presse-papiers refusé (cas possible sur iPhone) : le texte reste affiché pour une copie manuelle.
    }
    setTexteClaude({ texte, copie });
  };

  const exporter = () =>
    enregistrerFichier(ficheEnMarkdown(ctx, fiche, nomsDeFichiers(ctx)), `${nomFichierSur(fiche.titre)}_${dateFichier()}.md`, 'text/markdown');

  const infos: [string, React.ReactNode][] = [];
  if (fiche.auteur) infos.push(['Auteur', <Link to={`/fiches?auteur=${encodeURIComponent(fiche.auteur)}`}>{fiche.auteur}</Link>]);
  if (fiche.date) infos.push(['Date', fiche.date]);
  if (fiche.url) infos.push(['URL', <a href={fiche.url} target="_blank" rel="noopener noreferrer">{fiche.url}</a>]);
  for (const c of CHAMPS_PAR_TYPE[fiche.type]) if (fiche.champs?.[c.cle]) infos.push([c.libelle, fiche.champs[c.cle]]);
  infos.push(['Provenance', fiche.provenance?.mode === 'fichier' ? `Fichier importé : ${fiche.provenance.fichier ?? ''}` : 'Saisie manuelle']);
  if (fiche.provenance?.acquis_le) infos.push(['Acquise le', dateLisible(fiche.provenance.acquis_le)]);
  infos.push(['Créée le', dateLisible(fiche.created_at)], ['Modifiée le', dateLisible(fiche.updated_at)]);

  return (
    <article>
      <div className="ligne" style={{ marginBottom: 6 }}>
        <span className="etiquette type">{TYPES_FICHE[fiche.type]}</span>
        {fiche.domaine_ids.map((d) => domaines.find((x) => x.id === d)).filter(Boolean).map((d) => (
          <Link key={d!.id} className="etiquette" to={`/fiches?domaine=${d!.id}`}>{d!.nom}</Link>
        ))}
      </div>
      <h1 style={{ fontFamily: 'var(--police-lecture)' }}>{fiche.titre || 'Sans titre'}</h1>
      <div className="actions">
        <Link className="bouton principal" to={`/fiche/${fiche.id}/modifier`}>Modifier</Link>
        <button className="bouton" onClick={preparer}>Préparer pour Claude</button>
        <button className="bouton" onClick={exporter}>Exporter en Markdown</button>
        <button className="bouton danger droite" onClick={supprimer}>Supprimer</button>
      </div>

      {texteClaude && (
        <div className="carte">
          <div className={'bandeau ' + (texteClaude.copie ? 'ok' : 'attention')} role="status">
            {texteClaude.copie
              ? 'Texte copié dans le presse-papiers. Colle-le dans Claude.'
              : "Copie automatique refusée par le navigateur : sélectionne le texte ci-dessous et copie-le."}
          </div>
          <textarea readOnly value={texteClaude.texte} style={{ minHeight: 200 }} onFocus={(e) => e.currentTarget.select()} aria-label="Texte préparé pour Claude" />
          <div className="actions">
            <button className="bouton" onClick={() => setTexteClaude(null)}>Fermer</button>
          </div>
        </div>
      )}

      {fiche.type === 'citation' ? (
        <blockquote className="lecture" style={{ borderLeft: '3px solid var(--bord)', margin: '0 0 16px', paddingLeft: 16 }}>
          <Markdown texte={fiche.contenu} />
        </blockquote>
      ) : (
        fiche.contenu.trim() && <Markdown texte={fiche.contenu} />
      )}

      {fiche.type === 'dossier' && <ContenuDossier dossier={fiche} />}
      <BlocAffirmations fiche={fiche} />
      <BlocRelations fiche={fiche} />
      {fiche.type !== 'dossier' && <BlocDossiers fiche={fiche} />}

      <h2>Informations</h2>
      <dl className="infos">
        {infos.map(([nom, valeur]) => (
          <div key={nom} style={{ display: 'contents' }}>
            <dt>{nom}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// ---------------------------------------------------------------- Affirmations

function BlocAffirmations({ fiche }: { fiche: Fiche }) {
  const { ctx } = useDonnees();
  const affirmations = ctx.affirmations.filter((a) => a.fiche_id === fiche.id);
  // null = fermé ; 'nouvelle' = ajout ; sinon identifiant de l'affirmation en cours de modification
  const [edition, setEdition] = useState<string | null>(null);

  const supprimer = async (a: Affirmation) => {
    if (await confirmer({ titre: 'Supprimer cette affirmation ?', message: a.texte, bouton: 'Supprimer', danger: true })) {
      await supprimerSimple(bd, 'affirmations', a.id);
    }
  };

  return (
    <section>
      <h2>Affirmations</h2>
      <p className="doux petit">Le statut de chaque affirmation est attribué par toi, selon l'état de la preuve. L'app n'en pose aucun.</p>
      <ul className="liste">
        {affirmations.map((a) =>
          edition === a.id ? (
            <li key={a.id}><FormulaireAffirmation fiche={fiche} affirmation={a} fermer={() => setEdition(null)} /></li>
          ) : (
            <li key={a.id}>
              <div className="statut doux">{STATUTS[a.statut]}</div>
              <div className="lecture" style={{ fontSize: '1.05rem' }}>{a.texte}</div>
              {(a.source_id || a.localisation) && (
                <div className="petit doux">
                  Source :{' '}
                  {a.source_id && ctx.fiches.get(a.source_id) ? <Link to={`/fiche/${a.source_id}`}>{ctx.fiches.get(a.source_id)!.titre}</Link> : 'non précisée'}
                  {a.localisation && `, ${a.localisation}`}
                </div>
              )}
              {a.note && <div className="petit doux">Note : {a.note}</div>}
              <div className="actions" style={{ margin: '4px 0 0' }}>
                <button className="bouton discret" onClick={() => setEdition(a.id)}>Modifier</button>
                <button className="bouton discret" onClick={() => supprimer(a)}>Supprimer</button>
              </div>
            </li>
          ),
        )}
      </ul>
      {edition === 'nouvelle' ? (
        <FormulaireAffirmation fiche={fiche} fermer={() => setEdition(null)} />
      ) : (
        <button className="bouton" onClick={() => setEdition('nouvelle')}>Ajouter une affirmation</button>
      )}
    </section>
  );
}

function FormulaireAffirmation({ fiche, affirmation, fermer }: { fiche: Fiche; affirmation?: Affirmation; fermer: () => void }) {
  const { ctx } = useDonnees();
  const [texte, setTexte] = useState(affirmation?.texte ?? '');
  const [statut, setStatut] = useState<Statut | ''>(affirmation?.statut ?? '');
  const [sourceId, setSourceId] = useState<string | null>(affirmation?.source_id ?? null);
  const [localisation, setLocalisation] = useState(affirmation?.localisation ?? '');
  const [note, setNote] = useState(affirmation?.note ?? '');
  const source = sourceId ? ctx.fiches.get(sourceId) : undefined;

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texte.trim() || !statut) return;
    const donnees = { texte: texte.trim(), statut, source_id: sourceId, localisation: localisation.trim(), note: note.trim() };
    if (affirmation) await modifier(bd, 'affirmations', affirmation.id, donnees);
    else await creer(bd, 'affirmations', { fiche_id: fiche.id, ...donnees });
    fermer();
  };

  return (
    <form className="carte" onSubmit={enregistrer}>
      <div className="champ">
        <label htmlFor="a-texte">Affirmation</label>
        <textarea id="a-texte" value={texte} onChange={(e) => setTexte(e.target.value)} required autoFocus style={{ minHeight: 80 }} />
      </div>
      <div className="champ">
        <label htmlFor="a-statut">Statut (à choisir par toi)</label>
        <select id="a-statut" value={statut} onChange={(e) => setStatut(e.target.value as Statut)} required>
          <option value="">Choisir un statut…</option>
          {Object.entries(STATUTS).map(([cle, nom]) => <option key={cle} value={cle}>{nom}</option>)}
        </select>
      </div>
      <div className="grille">
        <div className="champ">
          <label htmlFor="a-source">Source (fiche existante)</label>
          {source ? (
            <div className="ligne">
              <span>{source.titre}</span>
              <button type="button" className="bouton discret" onClick={() => setSourceId(null)}>Retirer</button>
            </div>
          ) : (
            <SelecteurFiche id="a-source" exclure={[fiche.id]} onChoisir={(f) => setSourceId(f.id)} placeholder="Chercher une source…" />
          )}
        </div>
        <div className="champ">
          <label htmlFor="a-loc">Page ou section</label>
          <input id="a-loc" type="text" value={localisation} onChange={(e) => setLocalisation(e.target.value)} placeholder="p. 42, chap. 3…" />
        </div>
      </div>
      <div className="champ">
        <label htmlFor="a-note">Note</label>
        <input id="a-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="actions">
        <button className="bouton principal" type="submit">{affirmation ? 'Enregistrer' : 'Ajouter'}</button>
        <button className="bouton" type="button" onClick={fermer}>Annuler</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Relations

function BlocRelations({ fiche }: { fiche: Fiche }) {
  const { ctx, typesRelation } = useDonnees();
  const relations = useMemo(() => relationsDe(ctx, fiche.id), [ctx, fiche.id]);
  const [ajout, setAjout] = useState(false);
  // Choix du libellé : « identifiant du type » + sens (« > » de cette fiche vers l'autre, « < » l'inverse).
  const [choix, setChoix] = useState('');
  const [autre, setAutre] = useState<Fiche | null>(null);
  const [note, setNote] = useState('');

  const options = typesRelation.flatMap((t) => {
    const o = [{ valeur: t.id + '>', libelle: t.nom }];
    if (t.nom_inverse && t.nom_inverse !== t.nom) o.push({ valeur: t.id + '<', libelle: t.nom_inverse });
    return o;
  }).sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choix || !autre) return;
    const typeId = choix.slice(0, -1);
    const versAutre = choix.endsWith('>');
    await creer(bd, 'relations', {
      source_id: versAutre ? fiche.id : autre.id,
      cible_id: versAutre ? autre.id : fiche.id,
      type_relation_id: typeId,
      note: note.trim(),
    });
    setAutre(null);
    setNote('');
    setAjout(false);
  };

  const supprimer = async (r: (typeof relations)[number]) => {
    if (await confirmer({ titre: 'Supprimer cette relation ?', message: `${fiche.titre} ${r.libelle} ${r.autre.titre}`, bouton: 'Supprimer', danger: true })) {
      await supprimerSimple(bd, 'relations', r.relation.id);
    }
  };

  return (
    <section>
      <h2>Relations</h2>
      {relations.length === 0 && !ajout && <p className="doux">Aucune relation pour l'instant.</p>}
      <ul className="liste">
        {relations.map((r) => (
          <li key={r.relation.id} className="ligne">
            <span className="doux">{r.libelle}</span>
            <Link className="titre-fiche" to={`/fiche/${r.autre.id}`}>{r.autre.titre || 'Sans titre'}</Link>
            <span className="etiquette">{TYPES_FICHE[r.autre.type]}</span>
            {r.note && <span className="doux petit">{r.note}</span>}
            <button className="bouton discret droite" onClick={() => supprimer(r)} aria-label={`Supprimer la relation avec ${r.autre.titre}`}>Supprimer</button>
          </li>
        ))}
      </ul>
      {ajout ? (
        <form className="carte" onSubmit={ajouter}>
          <p style={{ marginTop: 0 }}><strong>{fiche.titre}</strong>…</p>
          <div className="grille">
            <div className="champ">
              <label htmlFor="r-type">Relation</label>
              <select id="r-type" value={choix} onChange={(e) => setChoix(e.target.value)} required>
                <option value="">Choisir…</option>
                {options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="r-autre">Fiche liée</label>
              {autre ? (
                <div className="ligne">
                  <span>{autre.titre}</span>
                  <button type="button" className="bouton discret" onClick={() => setAutre(null)}>Changer</button>
                </div>
              ) : (
                <SelecteurFiche id="r-autre" exclure={[fiche.id]} onChoisir={setAutre} />
              )}
            </div>
          </div>
          <div className="champ">
            <label htmlFor="r-note">Note (facultative)</label>
            <input id="r-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="doux petit">La liste des relations se modifie dans <Link to="/reglages">Réglages</Link>.</p>
          <div className="actions">
            <button className="bouton principal" type="submit" disabled={!choix || !autre}>Ajouter la relation</button>
            <button className="bouton" type="button" onClick={() => setAjout(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <button className="bouton" onClick={() => setAjout(true)}>Ajouter une relation</button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Dossiers

/** Sur une fiche ordinaire : les dossiers qui la contiennent. */
function BlocDossiers({ fiche }: { fiche: Fiche }) {
  const { ctx } = useDonnees();
  const liens = ctx.dossierFiches.filter((l) => l.fiche_id === fiche.id);
  const dejaDans = liens.map((l) => l.dossier_id);
  const ajouter = async (dossier: Fiche) => {
    const position = Math.max(-1, ...ctx.dossierFiches.filter((l) => l.dossier_id === dossier.id).map((l) => l.position)) + 1;
    await creer(bd, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: fiche.id, position, note: '' });
  };
  return (
    <section>
      <h2>Dossiers</h2>
      <ul className="liste">
        {liens.map((l) => (
          <li key={l.id} className="ligne">
            <Link className="titre-fiche" to={`/fiche/${l.dossier_id}`}>{ctx.fiches.get(l.dossier_id)!.titre}</Link>
            <button className="bouton discret droite" onClick={() => supprimerSimple(bd, 'dossier_fiches', l.id)}>Retirer du dossier</button>
          </li>
        ))}
      </ul>
      <div className="champ" style={{ maxWidth: 420 }}>
        <label htmlFor="d-ajout">Ajouter à un dossier</label>
        <SelecteurFiche id="d-ajout" types={['dossier']} exclure={dejaDans} onChoisir={ajouter} placeholder="Chercher un dossier…" />
      </div>
    </section>
  );
}

/** Sur un dossier : ses fiches, dans l'ordre choisi. */
function ContenuDossier({ dossier }: { dossier: Fiche }) {
  const { ctx } = useDonnees();
  const liens = ctx.dossierFiches.filter((l) => l.dossier_id === dossier.id);

  const ajouter = async (f: Fiche) => {
    const position = Math.max(-1, ...liens.map((l) => l.position)) + 1;
    await creer(bd, 'dossier_fiches', { dossier_id: dossier.id, fiche_id: f.id, position, note: '' });
  };
  const deplacer = async (i: number, sens: -1 | 1) => {
    const j = i + sens;
    if (j < 0 || j >= liens.length) return;
    const ordre = [...liens];
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
    // On renumérote : seules les lignes dont la position change sont modifiées.
    for (let k = 0; k < ordre.length; k++) if (ordre[k].position !== k) await modifier(bd, 'dossier_fiches', ordre[k].id, { position: k });
  };

  return (
    <section>
      <h2>Fiches du dossier ({liens.length})</h2>
      <ul className="liste">
        {liens.map((l, i) => {
          const f = ctx.fiches.get(l.fiche_id)!;
          return (
            <li key={l.id}>
              <div className="ligne">
                <Link className="titre-fiche" to={`/fiche/${f.id}`}>{f.titre || 'Sans titre'}</Link>
                <span className="etiquette">{TYPES_FICHE[f.type]}</span>
                <span className="droite">
                  <button className="bouton discret" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Monter ${f.titre}`}>↑</button>
                  <button className="bouton discret" onClick={() => deplacer(i, 1)} disabled={i === liens.length - 1} aria-label={`Descendre ${f.titre}`}>↓</button>
                  <button className="bouton discret" onClick={() => supprimerSimple(bd, 'dossier_fiches', l.id)}>Retirer</button>
                </span>
              </div>
              <input
                type="text"
                defaultValue={l.note}
                key={l.id + l.note}
                placeholder="Note sur la place de cette fiche dans le dossier…"
                aria-label={`Note sur ${f.titre}`}
                onBlur={(e) => e.target.value.trim() !== l.note && modifier(bd, 'dossier_fiches', l.id, { note: e.target.value.trim() })}
                style={{ marginTop: 6 }}
              />
            </li>
          );
        })}
      </ul>
      <div className="champ" style={{ maxWidth: 420 }}>
        <label htmlFor="dossier-ajout">Ajouter une fiche au dossier</label>
        <SelecteurFiche id="dossier-ajout" exclure={[dossier.id, ...liens.map((l) => l.fiche_id)]} onChoisir={ajouter} />
      </div>
    </section>
  );
}
