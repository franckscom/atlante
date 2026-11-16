// Protection contre la perte : stockage persistant, sauvegarde chiffrée, restauration, exports.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { bd, ecrireMeta, lireMeta } from '../../donnees/db';
import { JOURS_ALERTE_SAUVEGARDE } from '../../config';
import { chargerContexte } from '../../exports/contexte';
import { exportCsv } from '../../exports/csv';
import { creerZip, enregistrerFichier } from '../../exports/fichiers';
import { exportMarkdown } from '../../exports/markdown';
import { LIBELLES_TABLES, TABLES } from '../../modele/types';
import { cleSecoursValide, empreinteCle, genererCleSecours, nettoyerCleSecours } from '../../sauvegarde/chiffrement';
import { apercuRestauration, creerInstantane, creerSauvegarde, ouvrirSauvegarde, restaurer, type Apercu, type Instantane, type ModeRestauration } from '../../sauvegarde/sauvegarde';
import { lancerSynchro } from '../../synchro/etat';
import { dateFichier, dateLisible } from '../../utils/texte';
import { confirmer } from '../composants/Confirmation';

const formaterCle = (cle: string) => nettoyerCleSecours(cle).replace(/(.{4})(?=.)/g, '$1-');

function StockagePersistant() {
  const [etat, setEtat] = useState<'inconnu' | 'oui' | 'non' | 'absent'>('inconnu');
  const [usage, setUsage] = useState('');
  const verifier = async () => {
    if (!navigator.storage?.persisted) return setEtat('absent');
    setEtat((await navigator.storage.persisted()) ? 'oui' : 'non');
    const e = await navigator.storage.estimate?.();
    if (e?.usage != null) setUsage(`${(e.usage / 1_048_576).toFixed(1)} Mo utilisés` + (e.quota ? ` sur ${(e.quota / 1_073_741_824).toFixed(1)} Go disponibles` : ''));
  };
  useEffect(() => {
    void verifier();
  }, []);
  const demander = async () => {
    await navigator.storage.persist();
    await verifier();
  };
  return (
    <section className="carte">
      <h2>Stockage sur cet appareil</h2>
      {etat === 'oui' && <div className="bandeau ok">Stockage persistant accordé : le navigateur ne supprimera pas les données d'Atlante pour faire de la place.</div>}
      {etat === 'non' && (
        <div className="bandeau attention">
          Stockage persistant non accordé : le navigateur peut effacer les données locales s'il manque de place ou si l'app reste longtemps inutilisée.
          Tes données restent protégées par la synchro et par tes sauvegardes.
        </div>
      )}
      {etat === 'absent' && <div className="bandeau attention">Ce navigateur ne permet pas de demander un stockage persistant.</div>}
      {usage && <p className="doux petit">{usage}</p>}
      {etat === 'non' && (
        <>
          <button className="bouton" onClick={demander}>Demander le stockage persistant</button>
          <p className="doux petit" style={{ marginTop: 8 }}>
            Le navigateur décide seul, souvent sans poser de question. Il accepte plus volontiers quand l'app est installée (écran d'accueil sur iPhone, « Installer » sur ordinateur).
          </p>
        </>
      )}
    </section>
  );
}

function SauvegardeChiffree() {
  const cle = useLiveQuery(() => lireMeta<string | null>(bd, 'cle_secours', null), [], undefined);
  const derniere = useLiveQuery(() => lireMeta<string | null>(bd, 'derniere_sauvegarde', null), [], undefined);
  const [proposee, setProposee] = useState<string | null>(null);
  const [notee, setNotee] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [modeSaisie, setModeSaisie] = useState(false);
  const [voirCle, setVoirCle] = useState(false);
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [message, setMessage] = useState<{ genre: 'ok' | 'danger'; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [empreinte, setEmpreinte] = useState('');
  useEffect(() => {
    if (cle) void empreinteCle(cle).then(setEmpreinte);
  }, [cle]);

  const jours = derniere ? Math.floor((Date.now() - new Date(derniere).getTime()) / 86_400_000) : null;

  const sauvegarder = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (mdp.length < 10) return setMessage({ genre: 'danger', texte: 'Choisis un mot de passe d\'au moins 10 caractères (une phrase de plusieurs mots est idéale).' });
    if (mdp !== mdp2) return setMessage({ genre: 'danger', texte: 'Les deux mots de passe ne sont pas identiques.' });
    setOccupe(true);
    try {
      const archive = await creerSauvegarde(bd, mdp, cle!);
      await enregistrerFichier(JSON.stringify(archive), `atlante_sauvegarde_${dateFichier()}.atlante`, 'application/octet-stream');
      setMdp('');
      setMdp2('');
      setMessage({ genre: 'ok', texte: 'Sauvegarde créée. Range le fichier hors de cet appareil (clé USB, disque externe, autre ordinateur).' });
    } catch (err) {
      setMessage({ genre: 'danger', texte: 'Sauvegarde impossible : ' + (err as Error).message });
    } finally {
      setOccupe(false);
    }
  };

  if (cle === undefined) return null;

  return (
    <section className="carte">
      <h2>Sauvegarde complète chiffrée</h2>
      <p>
        Dernière sauvegarde : <strong>{derniere ? `${dateLisible(derniere)} (il y a ${jours} jour${jours! > 1 ? 's' : ''})` : 'jamais'}</strong>
      </p>
      {(jours === null || jours > JOURS_ALERTE_SAUVEGARDE) && (
        <div className="bandeau attention">
          {jours === null ? 'Aucune sauvegarde pour le moment.' : `Plus de ${JOURS_ALERTE_SAUVEGARDE} jours sans sauvegarde.`} Le serveur gratuit ne fait aucune sauvegarde : ce fichier est ta copie indépendante.
        </div>
      )}

      {!cle ? (
        <>
          <h3>Étape 1 : ta clé de secours</h3>
          <p>
            La sauvegarde est chiffrée par un mot de passe. La clé de secours est la seconde façon de l'ouvrir, si tu oublies le mot de passe.
            <strong> Mot de passe et clé de secours perdus tous les deux : la sauvegarde est illisible, par personne, pour toujours.</strong>
          </p>
          {!modeSaisie ? (
            <>
              {!proposee ? (
                <div className="actions">
                  <button className="bouton principal" onClick={() => setProposee(genererCleSecours())}>Créer ma clé de secours</button>
                  <button className="bouton" onClick={() => setModeSaisie(true)}>J'ai déjà une clé (autre appareil)</button>
                </div>
              ) : (
                <>
                  <div className="cle-secours" aria-label="Clé de secours">{proposee}</div>
                  <div className="actions pas-imprimer">
                    <button className="bouton" onClick={() => window.print()}>Imprimer cette page</button>
                  </div>
                  <p className="doux petit">Imprime-la ou recopie-la à la main, et range-la loin de l'ordinateur (pas dans un fichier sur le même appareil, pas par e-mail).</p>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--texte)', fontSize: '1rem' }}>
                    <input type="checkbox" checked={notee} onChange={(e) => setNotee(e.target.checked)} />
                    J'ai imprimé ou recopié ma clé de secours.
                  </label>
                  <div className="actions">
                    <button className="bouton principal" disabled={!notee} onClick={() => ecrireMeta(bd, 'cle_secours', nettoyerCleSecours(proposee))}>Continuer</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (cleSecoursValide(saisie)) await ecrireMeta(bd, 'cle_secours', nettoyerCleSecours(saisie));
              }}
            >
              <div className="champ">
                <label htmlFor="s-cle">Clé de secours existante (32 caractères)</label>
                <input id="s-cle" type="text" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
              </div>
              {saisie && !cleSecoursValide(saisie) && <p className="petit doux">Clé incomplète ou caractère non reconnu.</p>}
              <div className="actions">
                <button className="bouton principal" type="submit" disabled={!cleSecoursValide(saisie)}>Utiliser cette clé</button>
                <button className="bouton" type="button" onClick={() => setModeSaisie(false)}>Retour</button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <form onSubmit={sauvegarder}>
            <div className="grille">
              <div className="champ">
                <label htmlFor="s-mdp">Mot de passe de la sauvegarde</label>
                <input id="s-mdp" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="champ">
                <label htmlFor="s-mdp2">Le même, une seconde fois</label>
                <input id="s-mdp2" type="password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <p className="doux petit">
              Ce mot de passe n'est enregistré nulle part : il te sera demandé pour restaurer. Tu peux réutiliser le même à chaque sauvegarde.
              Clé de secours enregistrée sur cet appareil (empreinte {empreinte}).
            </p>
            {message && <div className={'bandeau ' + message.genre} role="status">{message.texte}</div>}
            <div className="actions">
              <button className="bouton principal" type="submit" disabled={occupe}>{occupe ? 'Chiffrement en cours…' : 'Sauvegarder maintenant'}</button>
              <button className="bouton" type="button" onClick={() => setVoirCle(!voirCle)}>{voirCle ? 'Masquer la clé de secours' : 'Revoir ma clé de secours'}</button>
            </div>
          </form>
          {voirCle && (
            <>
              <div className="cle-secours">{formaterCle(cle)}</div>
              <div className="actions pas-imprimer">
                <button className="bouton" onClick={() => window.print()}>Imprimer cette page</button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Restauration() {
  const [texte, setTexte] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [genre, setGenre] = useState<'mot_de_passe' | 'cle_secours'>('mot_de_passe');
  const [secret, setSecret] = useState('');
  const [instantane, setInstantane] = useState<Instantane | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [mode, setMode] = useState<ModeRestauration>('ajouter');
  const [message, setMessage] = useState<{ genre: 'ok' | 'danger'; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  const ouvrir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texte) return;
    setMessage(null);
    setOccupe(true);
    try {
      const i = await ouvrirSauvegarde(texte, secret, genre);
      setInstantane(i);
      setApercu(await apercuRestauration(bd, i));
      // Restaurer avec la clé de secours sur un appareil qui n'en a pas : on l'adopte pour les prochaines sauvegardes.
      if (genre === 'cle_secours' && !(await lireMeta(bd, 'cle_secours', null))) await ecrireMeta(bd, 'cle_secours', nettoyerCleSecours(secret));
      setSecret('');
    } catch (err) {
      setMessage({ genre: 'danger', texte: (err as Error).message });
    } finally {
      setOccupe(false);
    }
  };

  const appliquer = async () => {
    if (!instantane || !apercu) return;
    const total = (cle: 'nouvelles' | 'differentes' | 'seulementIci') => TABLES.reduce((n, t) => n + apercu.tables[t][cle], 0);
    const consequences =
      mode === 'ajouter'
        ? `${total('nouvelles')} élément(s) ajouté(s). Rien d'existant n'est modifié.`
        : mode === 'fusionner'
          ? `${total('nouvelles')} élément(s) ajouté(s), ${total('differentes')} remplacé(s) par la version sauvegardée.`
          : `${total('nouvelles')} élément(s) ajouté(s), ${total('differentes')} remplacé(s) par la version sauvegardée, ${total('seulementIci')} élément(s) absent(s) de la sauvegarde envoyé(s) à la corbeille.`;
    const ok = await confirmer({
      titre: 'Restaurer cette sauvegarde ?',
      message: consequences + (mode === 'ajouter' ? '' : '\n\nConseil : fais d\'abord une sauvegarde de l\'état actuel.'),
      bouton: 'Restaurer',
      danger: mode !== 'ajouter',
    });
    if (!ok) return;
    await restaurer(bd, instantane, mode);
    setInstantane(null);
    setApercu(null);
    setTexte(null);
    setMessage({ genre: 'ok', texte: 'Restauration terminée. Les données restaurées seront renvoyées au serveur à la prochaine synchro.' });
    void lancerSynchro();
  };

  return (
    <section className="carte">
      <h2>Restaurer une sauvegarde</h2>
      {!apercu ? (
        <form onSubmit={ouvrir}>
          <div className="champ">
            <label htmlFor="r-fichier">Fichier de sauvegarde (.atlante)</label>
            <input
              id="r-fichier"
              type="file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setTexte(f ? await f.text() : null);
                setNomFichier(f?.name ?? '');
                setMessage(null);
              }}
            />
          </div>
          <div className="cases champ">
            <label><input type="radio" name="genre" checked={genre === 'mot_de_passe'} onChange={() => setGenre('mot_de_passe')} /> Avec le mot de passe</label>
            <label><input type="radio" name="genre" checked={genre === 'cle_secours'} onChange={() => setGenre('cle_secours')} /> Avec la clé de secours</label>
          </div>
          <div className="champ">
            <label htmlFor="r-secret">{genre === 'mot_de_passe' ? 'Mot de passe de la sauvegarde' : 'Clé de secours'}</label>
            <input id="r-secret" type={genre === 'mot_de_passe' ? 'password' : 'text'} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          {message && <div className={'bandeau ' + message.genre} role="status">{message.texte}</div>}
          <button className="bouton principal" type="submit" disabled={!texte || !secret || occupe}>{occupe ? 'Déchiffrement…' : 'Ouvrir et afficher l\'aperçu'}</button>
          <p className="doux petit" style={{ marginTop: 8 }}>L'ouverture vérifie l'intégrité du fichier et sa version. Rien n'est modifié avant ta confirmation.</p>
        </form>
      ) : (
        <>
          <div className="bandeau ok">
            Fichier intact et lisible : <strong>{nomFichier}</strong>, sauvegarde du {dateLisible(apercu.cree_le)} (Atlante {apercu.version_app}).
          </div>
          <h3>Aperçu : sauvegarde comparée à cet appareil</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="simple">
              <thead>
                <tr><th>Éléments</th><th className="nombre">Absents d'ici</th><th className="nombre">Identiques</th><th className="nombre">Différents</th><th className="nombre">Ici seulement</th></tr>
              </thead>
              <tbody>
                {TABLES.map((t) => (
                  <tr key={t}>
                    <td>{LIBELLES_TABLES[t]}</td>
                    <td className="nombre">{apercu.tables[t].nouvelles}</td>
                    <td className="nombre">{apercu.tables[t].identiques}</td>
                    <td className="nombre">{apercu.tables[t].differentes}</td>
                    <td className="nombre">{apercu.tables[t].seulementIci}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: '14px 0' }}>
            <legend style={{ padding: 0, fontWeight: 600 }}>Que faire ?</legend>
            <label style={{ color: 'var(--texte)', fontSize: '1rem', margin: '8px 0' }}>
              <input type="radio" name="mode" checked={mode === 'ajouter'} onChange={() => setMode('ajouter')} /> <strong>Ajouter ce qui manque.</strong> Aucun élément existant n'est modifié.
            </label>
            <label style={{ color: 'var(--texte)', fontSize: '1rem', margin: '8px 0' }}>
              <input type="radio" name="mode" checked={mode === 'fusionner'} onChange={() => setMode('fusionner')} /> <strong>Fusionner.</strong> Ajoute ce qui manque ; les éléments différents reprennent leur version sauvegardée.
            </label>
            <label style={{ color: 'var(--texte)', fontSize: '1rem', margin: '8px 0' }}>
              <input type="radio" name="mode" checked={mode === 'remplacer'} onChange={() => setMode('remplacer')} /> <strong>Revenir à l'état sauvegardé.</strong> Comme « Fusionner », et ce qui n'est pas dans la sauvegarde part à la corbeille.
            </label>
          </fieldset>
          <div className="actions">
            <button className="bouton principal" onClick={appliquer}>Restaurer…</button>
            <button className="bouton" onClick={() => { setApercu(null); setInstantane(null); }}>Annuler</button>
          </div>
        </>
      )}
      {!apercu && message?.genre === 'ok' && null}
    </section>
  );
}

function Exports() {
  const [message, setMessage] = useState('');
  const faire = async (quoi: 'markdown' | 'json' | 'csv') => {
    setMessage('');
    try {
      if (quoi === 'json') {
        await enregistrerFichier(JSON.stringify(await creerInstantane(bd), null, 2), `atlante_export_${dateFichier()}.json`, 'application/json');
      } else {
        const ctx = await chargerContexte(bd);
        const fichiers = quoi === 'markdown' ? exportMarkdown(ctx) : exportCsv(ctx);
        await enregistrerFichier(creerZip(fichiers), `atlante_${quoi}_${dateFichier()}.zip`, 'application/zip');
      }
      setMessage('Export créé.');
    } catch (e) {
      setMessage('Export impossible : ' + (e as Error).message);
    }
  };
  return (
    <section className="carte">
      <h2>Exports lisibles hors de l'app</h2>
      <p className="doux">Ces fichiers ne sont pas chiffrés : range-les en lieu sûr.</p>
      <div className="actions">
        <button className="bouton" onClick={() => faire('markdown')}>Markdown (une fiche par fichier)</button>
        <button className="bouton" onClick={() => faire('json')}>JSON complet</button>
        <button className="bouton" onClick={() => faire('csv')}>CSV par type</button>
      </div>
      {message && <p role="status">{message}</p>}
      <h3>Ce qui est exporté, ce qui ne l'est pas</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="simple">
          <thead><tr><th>Format</th><th>Contient</th><th>Ne contient pas</th></tr></thead>
          <tbody>
            <tr>
              <td>Sauvegarde chiffrée (.atlante)</td>
              <td>Tout : fiches, domaines, relations et leurs types, affirmations, dossiers, corbeille. Seul format que l'app sait restaurer.</td>
              <td rowSpan={2}>Ton e-mail et ton mot de passe de compte, la clé de secours, les réglages de l'appareil (thème, dates de synchro), les conflits en attente.</td>
            </tr>
            <tr>
              <td>JSON complet</td>
              <td>La même chose, en clair, pour un autre outil ou une vérification.</td>
            </tr>
            <tr>
              <td>Markdown (.zip)</td>
              <td>Une fiche par fichier, rangée par type : champs, contenu, affirmations avec statut et source, relations et dossiers sous forme de liens.</td>
              <td>La corbeille, les identifiants des relations.</td>
            </tr>
            <tr>
              <td>CSV (.zip)</td>
              <td>Un tableau par type de fiche, plus relations, affirmations, dossiers et domaines.</td>
              <td>La corbeille.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PageSauvegarde() {
  return (
    <div className="etroit">
      <h1>Sauvegarde et exports</h1>
      <SauvegardeChiffree />
      <Restauration />
      <Exports />
      <StockagePersistant />
    </div>
  );
}
