// Réglages : compte, synchro, apparence, types de relation, corbeille, effacement.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { bd, lireMeta, semerSiPremierLancement } from '../../donnees/db';
import { SUPABASE_TABLEAU_DE_BORD, VERSION_APP } from '../../config';
import { creer, effacerDonneesLocales, modifier, restaurerFiche, supprimerTypeRelation } from '../../donnees/depot';
import { TYPES_FICHE, type TypeRelation } from '../../modele/types';
import { lancerSynchro, useEtatSynchro } from '../../synchro/etat';
import { DistantSupabase } from '../../synchro/distantSupabase';
import { compterCorbeille, compterEnAttente, viderCorbeille } from '../../synchro/moteur';
import { changerMotDePasse, connecter, creerCompte, deconnecter, demanderNouveauMotDePasse, messageErreurCompte, retourLienEmail, supabase, supprimerCompteServeur } from '../../synchro/supabase';
import { dateLisible } from '../../utils/texte';
import { confirmer } from '../composants/Confirmation';
import { affichageSynchro } from '../composants/IndicateurSynchro';
import { useDonnees } from '../donnees';

type Message = { genre: 'ok' | 'danger' | 'attention'; texte: string } | null;

function Compte() {
  const etat = useEtatSynchro();
  const [mode, setMode] = useState<'connexion' | 'creation' | 'oubli'>('connexion');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [message, setMessage] = useState<Message>(retourLienEmail.erreur ? { genre: 'danger', texte: 'Lien invalide ou expiré : ' + decodeURIComponent(retourLienEmail.erreur) } : null);
  const [occupe, setOccupe] = useState(false);
  // Arrivée par le lien « mot de passe oublié » : on propose aussitôt d'en choisir un nouveau.
  const [recuperation, setRecuperation] = useState(retourLienEmail.recuperation);
  const [nouveau, setNouveau] = useState('');

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setOccupe(true);
    try {
      if (mode === 'connexion') await connecter(email.trim(), mdp);
      else if (mode === 'creation') {
        if (mdp.length < 10) throw new Error('Choisis un mot de passe d\'au moins 10 caractères.');
        const r = await creerCompte(email.trim(), mdp);
        if (r === 'confirmer_email') setMessage({ genre: 'ok', texte: 'Compte créé. Ouvre le lien de confirmation reçu par e-mail, puis connecte-toi ici.' });
        setMode('connexion');
      } else {
        await demanderNouveauMotDePasse(email.trim());
        setMessage({ genre: 'ok', texte: 'Si un compte existe pour cette adresse, un e-mail vient de partir. Ouvre le lien sur cet appareil.' });
      }
      setMdp('');
    } catch (err) {
      setMessage({ genre: 'danger', texte: messageErreurCompte(err) });
    } finally {
      setOccupe(false);
    }
  };

  const changer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nouveau.length < 10) return setMessage({ genre: 'danger', texte: 'Au moins 10 caractères.' });
    try {
      await changerMotDePasse(nouveau);
      setNouveau('');
      setRecuperation(false);
      setMessage({ genre: 'ok', texte: 'Mot de passe modifié.' });
    } catch (err) {
      setMessage({ genre: 'danger', texte: messageErreurCompte(err) });
    }
  };

  const quitter = async () => {
    const enAttente = await compterEnAttente(bd);
    const ok = await confirmer({
      titre: 'Se déconnecter ?',
      message: 'Tes données restent sur cet appareil, mais ne seront plus synchronisées.' + (enAttente ? `\n\n${enAttente} modification(s) n'ont pas encore été envoyées au serveur.` : ''),
      bouton: 'Se déconnecter',
    });
    if (ok) await deconnecter();
  };

  return (
    <section className="carte">
      <h2>Compte</h2>
      {message && <div className={'bandeau ' + message.genre} role="status">{message.texte}</div>}
      {!etat.sessionChargee ? (
        <p className="doux">Chargement…</p>
      ) : etat.utilisateur ? (
        <>
          <p>Connecté : <strong>{etat.utilisateur.email}</strong></p>
          {recuperation ? (
            <form onSubmit={changer}>
              <div className="champ" style={{ maxWidth: 360 }}>
                <label htmlFor="c-nouveau">Nouveau mot de passe du compte</label>
                <input id="c-nouveau" type="password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} autoComplete="new-password" autoFocus />
              </div>
              <div className="actions">
                <button className="bouton principal" type="submit">Enregistrer le mot de passe</button>
                <button className="bouton" type="button" onClick={() => setRecuperation(false)}>Annuler</button>
              </div>
            </form>
          ) : (
            <div className="actions">
              <button className="bouton" onClick={() => setRecuperation(true)}>Changer de mot de passe</button>
              <button className="bouton" onClick={quitter}>Se déconnecter</button>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={soumettre} style={{ maxWidth: 420 }}>
          <p className="doux">
            {mode === 'connexion' && 'Connecte-toi pour synchroniser tes appareils. Sans connexion, Atlante fonctionne sur cet appareil seulement.'}
            {mode === 'creation' && 'Création du compte (possible tant que les inscriptions sont ouvertes sur le serveur).'}
            {mode === 'oubli' && 'Tu recevras un lien pour choisir un nouveau mot de passe.'}
          </p>
          <div className="champ">
            <label htmlFor="c-email">Adresse e-mail</label>
            <input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          {mode !== 'oubli' && (
            <div className="champ">
              <label htmlFor="c-mdp">Mot de passe</label>
              <input id="c-mdp" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete={mode === 'creation' ? 'new-password' : 'current-password'} required />
            </div>
          )}
          <div className="actions">
            <button className="bouton principal" type="submit" disabled={occupe}>
              {mode === 'connexion' ? 'Se connecter' : mode === 'creation' ? 'Créer mon compte' : 'Envoyer le lien'}
            </button>
            {mode !== 'connexion' && <button className="bouton discret" type="button" onClick={() => setMode('connexion')}>J'ai déjà un compte</button>}
            {mode === 'connexion' && <button className="bouton discret" type="button" onClick={() => setMode('creation')}>Créer un compte</button>}
            {mode === 'connexion' && <button className="bouton discret" type="button" onClick={() => setMode('oubli')}>Mot de passe oublié</button>}
          </div>
        </form>
      )}
    </section>
  );
}

function Synchro() {
  const etat = useEtatSynchro();
  const enAttente = useLiveQuery(() => compterEnAttente(bd), [], 0);
  const conflits = useLiveQuery(() => bd.conflits.count(), [], 0);
  const derniere = useLiveQuery(() => lireMeta<string | null>(bd, 'derniere_synchro', null), [etat.derniereReussite], null);
  const a = affichageSynchro(etat, enAttente, conflits);
  return (
    <section className="carte">
      <h2>Synchronisation</h2>
      <p>
        <span className={'synchro ' + a.classe}><span className="pastille" aria-hidden="true" />{a.long}</span>
      </p>
      <p className="doux petit">Dernière synchro réussie : {derniere ? dateLisible(derniere) : 'jamais'}. Elle se lance seule quand l'app est ouverte, en ligne et connectée.</p>
      {conflits > 0 && <div className="bandeau attention">{conflits} conflit(s) à trancher. <Link to="/conflits">Voir les conflits</Link></div>}
      {etat.phase === 'injoignable' && (
        <div className="bandeau danger" role="alert">
          <strong>{etat.message}.</strong> Atlante continue de fonctionner sur cet appareil ; tes modifications partiront dès que le serveur répondra.
          <p style={{ margin: '8px 0 0' }}>Un projet Supabase gratuit est mis en pause après 7 jours sans activité (les données sont conservées). Pour le réactiver :</p>
          <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            <li>Ouvre <a href={SUPABASE_TABLEAU_DE_BORD} target="_blank" rel="noopener noreferrer">le tableau de bord Supabase</a> et connecte-toi.</li>
            <li>Sur le projet « atlante », clique sur « Restore project » (ou « Resume »).</li>
            <li>Attends quelques minutes, puis reviens ici et clique sur « Synchroniser maintenant ».</li>
          </ol>
        </div>
      )}
      {etat.phase === 'erreur' && (
        <div className="bandeau danger" role="alert">
          {etat.message}
          {etat.erreursLignes.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary>Détail technique</summary>
              <ul className="petit">{etat.erreursLignes.slice(0, 20).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      <button className="bouton principal" onClick={() => void lancerSynchro()} disabled={!etat.utilisateur || !etat.enLigne || etat.phase === 'en_cours'}>
        Synchroniser maintenant
      </button>
      {!etat.utilisateur && <p className="doux petit" style={{ marginTop: 8 }}>Connecte-toi pour activer la synchro.</p>}
    </section>
  );
}

function Apparence() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('atlante-theme') ?? 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('atlante-theme', theme);
    } catch {
      // stockage refusé : le thème vaut pour cette session seulement
    }
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <section className="carte">
      <h2>Apparence</h2>
      <div className="cases">
        {[['auto', "Comme l'appareil"], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([valeur, nom]) => (
          <label key={valeur}><input type="radio" name="theme" checked={theme === valeur} onChange={() => setTheme(valeur)} /> {nom}</label>
        ))}
      </div>
    </section>
  );
}

function TypesRelation() {
  const { typesRelation, ctx } = useDonnees();
  const [nom, setNom] = useState('');
  const [inverse, setInverse] = useState('');
  const [edition, setEdition] = useState<{ id: string; nom: string; nom_inverse: string } | null>(null);

  const supprimer = async (t: TypeRelation) => {
    const n = ctx.relations.filter((r) => r.type_relation_id === t.id).length;
    const ok = await confirmer({
      titre: 'Supprimer ce type de relation ?',
      message: `« ${t.nom} » sera supprimé.` + (n ? ` Les ${n} relation(s) qui l'utilisent seront supprimées aussi.` : ''),
      bouton: 'Supprimer',
      danger: true,
    });
    if (ok) await supprimerTypeRelation(bd, t.id);
  };

  return (
    <section className="carte">
      <h2>Types de relation</h2>
      <p className="doux petit">Chaque relation se lit dans les deux sens : « a écrit » d'un côté, « écrit par » de l'autre.</p>
      <ul className="liste">
        {typesRelation.map((t) => (
          <li key={t.id}>
            {edition?.id === t.id ? (
              <form
                className="ligne"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (edition.nom.trim()) await modifier(bd, 'types_relation', t.id, { nom: edition.nom.trim(), nom_inverse: edition.nom_inverse.trim() });
                  setEdition(null);
                }}
              >
                <input type="text" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} aria-label="Nom" style={{ flex: 1, width: 'auto' }} autoFocus />
                <input type="text" value={edition.nom_inverse} onChange={(e) => setEdition({ ...edition, nom_inverse: e.target.value })} aria-label="Nom dans l'autre sens" style={{ flex: 1, width: 'auto' }} />
                <button className="bouton principal" type="submit">Enregistrer</button>
                <button className="bouton" type="button" onClick={() => setEdition(null)}>Annuler</button>
              </form>
            ) : (
              <div className="ligne">
                <span>{t.nom}</span>
                <span className="doux petit">↔ {t.nom_inverse || t.nom}</span>
                <span className="droite">
                  <button className="bouton discret" onClick={() => setEdition({ id: t.id, nom: t.nom, nom_inverse: t.nom_inverse })}>Modifier</button>
                  <button className="bouton discret" onClick={() => supprimer(t)}>Supprimer</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        className="actions"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!nom.trim()) return;
          await creer(bd, 'types_relation', { nom: nom.trim(), nom_inverse: inverse.trim() });
          setNom('');
          setInverse('');
        }}
      >
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouveau : « réfute »" aria-label="Nom du nouveau type" style={{ flex: 1, width: 'auto' }} />
        <input type="text" value={inverse} onChange={(e) => setInverse(e.target.value)} placeholder="Autre sens : « réfuté par »" aria-label="Nom dans l'autre sens" style={{ flex: 1, width: 'auto' }} />
        <button className="bouton principal" type="submit">Ajouter</button>
      </form>
    </section>
  );
}

function Corbeille() {
  const etat = useEtatSynchro();
  const supprimees = useLiveQuery(async () => (await bd.fiches.filter((f) => !!f.deleted_at).toArray()).sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')), [], []);
  // La corbeille contient aussi des relations, affirmations, domaines… supprimés.
  const total = useLiveQuery(() => compterCorbeille(bd), [], 0);
  const compteConnu = useLiveQuery(() => lireMeta<string | null>(bd, 'utilisateur_id', null), [], null);
  const [etape, setEtape] = useState(0);
  const [mot, setMot] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [occupe, setOccupe] = useState(false);

  // Appareil relié à un compte : l'effacement doit aussi se faire sur le serveur, donc connecté et en ligne.
  const serveurRequis = !!compteConnu || !!etat.utilisateur;
  const serveurPret = !!etat.utilisateur && etat.enLigne;

  const vider = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setOccupe(true);
    try {
      if (serveurRequis) await lancerSynchro(); // les suppressions récentes doivent d'abord atteindre le serveur
      const n = await viderCorbeille(bd, serveurRequis ? new DistantSupabase(supabase) : null);
      setEtape(0);
      setMot('');
      setMessage({
        genre: 'ok',
        texte:
          `${n} élément${n > 1 ? 's' : ''} effacé${n > 1 ? 's' : ''} définitivement` +
          (serveurRequis ? ' du serveur et de cet appareil. Tes autres appareils les effaceront à leur prochaine synchro.' : ' de cet appareil.') +
          ' Tes anciens fichiers de sauvegarde et d\'export les contiennent encore : détruis-les si tu veux un effacement complet.',
      });
    } catch (err) {
      setMessage({ genre: 'danger', texte: 'Corbeille non vidée : ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section className="carte">
      <h2>Corbeille</h2>
      {message && <div className={'bandeau ' + message.genre} role="status">{message.texte}</div>}
      {supprimees.length === 0 ? (
        <p className="doux">{total > 0 ? `Aucune fiche, mais ${total} autre${total > 1 ? 's' : ''} élément${total > 1 ? 's' : ''} supprimé${total > 1 ? 's' : ''} (relations, affirmations, domaines…).` : 'La corbeille est vide.'}</p>
      ) : (
        <ul className="liste">
          {supprimees.map((f) => (
            <li key={f.id} className="ligne">
              <span>{f.titre || 'Sans titre'}</span>
              <span className="etiquette">{TYPES_FICHE[f.type]}</span>
              <span className="doux petit">supprimée le {dateLisible(f.deleted_at)}</span>
              <button className="bouton discret droite" onClick={() => restaurerFiche(bd, f.id)}>Restaurer</button>
            </li>
          ))}
        </ul>
      )}
      <p className="doux petit">
        Une fiche supprimée reste dans la corbeille : c'est ce qui permet à la suppression d'atteindre tes autres appareils, et de la restaurer avec ses relations et ses affirmations.
        Vider la corbeille efface réellement ces données, partout.
      </p>

      {total > 0 && etape === 0 && (
        <button className="bouton danger" onClick={() => { setMessage(null); setEtape(1); }}>Vider la corbeille…</button>
      )}
      {total > 0 && etape === 1 && (
        <div className="bandeau danger">
          <p>
            <strong>Étape 1 sur 2 : garde une copie si tu en veux une.</strong> {total} élément{total > 1 ? 's' : ''} ({supprimees.length} fiche{supprimees.length > 1 ? 's' : ''}, le reste en relations, affirmations et autres) {total > 1 ? 'seront effacés' : 'sera effacé'} pour de bon
            {serveurRequis ? ' du serveur et de tous tes appareils' : ' de cet appareil'}. Aucune restauration ne sera possible depuis l'app.
            La sauvegarde chiffrée et l'export JSON contiennent la corbeille.
          </p>
          <div className="actions">
            <Link className="bouton" to="/sauvegarde">Aller à Sauvegarde et exports</Link>
            <button className="bouton danger" onClick={() => setEtape(2)}>Continuer sans exporter, ou export déjà fait</button>
            <button className="bouton" onClick={() => setEtape(0)}>Annuler</button>
          </div>
        </div>
      )}
      {total > 0 && etape === 2 && (
        <form className="bandeau danger" onSubmit={vider}>
          <p><strong>Étape 2 sur 2 : confirmation définitive.</strong></p>
          <div className="champ">
            <label htmlFor="v-mot">Écris VIDER en majuscules</label>
            <input id="v-mot" type="text" value={mot} onChange={(e) => setMot(e.target.value)} autoComplete="off" />
          </div>
          {serveurRequis && !serveurPret && (
            <p className="petit">
              Il faut être connecté et en ligne : sans cela, les données resteraient sur le serveur et sur tes autres appareils.
            </p>
          )}
          <div className="actions">
            <button className="bouton danger" type="submit" disabled={mot !== 'VIDER' || occupe || (serveurRequis && !serveurPret)}>
              {occupe ? 'Effacement…' : 'Vider définitivement la corbeille'}
            </button>
            <button className="bouton" type="button" onClick={() => { setEtape(0); setMot(''); }}>Annuler</button>
          </div>
        </form>
      )}
    </section>
  );
}

function Effacement() {
  const etat = useEtatSynchro();
  const [etape, setEtape] = useState(0);
  const [mot, setMot] = useState('');
  const [mdp, setMdp] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [occupe, setOccupe] = useState(false);

  const effacerLocal = async () => {
    const enAttente = await compterEnAttente(bd);
    const ok = await confirmer({
      titre: 'Effacer les données de cet appareil ?',
      message:
        'Toutes les données d\'Atlante sont effacées de CET appareil, clé de secours comprise. Le serveur n\'est pas touché.' +
        (etat.utilisateur ? ' Tu seras déconnecté.' : ' Tu n\'es pas connecté : sans sauvegarde, ces données seront perdues.') +
        (enAttente ? `\n\nAttention : ${enAttente} modification(s) n'ont pas encore été envoyées au serveur et seront perdues.` : ''),
      bouton: 'Effacer cet appareil',
      danger: true,
    });
    if (!ok) return;
    if (etat.utilisateur) await deconnecter();
    await effacerDonneesLocales(bd);
    await semerSiPremierLancement(bd);
    setMessage({ genre: 'ok', texte: 'Données locales effacées.' });
  };

  const supprimerCompte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!etat.utilisateur) return;
    setMessage(null);
    setOccupe(true);
    try {
      // Seconde confirmation : le mot de passe prouve que c'est bien moi.
      const { error } = await supabase.auth.signInWithPassword({ email: etat.utilisateur.email, password: mdp });
      if (error) throw error;
      await supprimerCompteServeur();
      await deconnecter().catch(() => undefined);
      await effacerDonneesLocales(bd);
      await semerSiPremierLancement(bd);
      setEtape(0);
      setMot('');
      setMdp('');
      setMessage({ genre: 'ok', texte: 'Compte et données supprimés du serveur, données effacées de cet appareil. Pense à effacer aussi tes autres appareils (Réglages, « Effacer les données de cet appareil ») et à détruire tes fichiers de sauvegarde et d\'export si tu veux un effacement complet.' });
    } catch (err) {
      setMessage({ genre: 'danger', texte: 'Suppression non effectuée : ' + messageErreurCompte(err) });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section className="carte">
      <h2>Effacement</h2>
      {message && <div className={'bandeau ' + message.genre} role="status">{message.texte}</div>}
      <h3>Cet appareil</h3>
      <button className="bouton danger" onClick={effacerLocal}>Effacer les données de cet appareil</button>

      <h3 style={{ marginTop: 20 }}>Supprimer mon compte et toutes mes données</h3>
      <p className="doux petit">Droit à l'effacement (RGPD, article 17) : supprime le compte et toutes les données du serveur, puis efface cet appareil. Irréversible.</p>
      {!etat.utilisateur ? (
        <p className="doux">Connecte-toi pour supprimer ton compte.</p>
      ) : etape === 0 ? (
        <button className="bouton danger" onClick={() => setEtape(1)}>Supprimer mon compte…</button>
      ) : etape === 1 ? (
        <div className="bandeau danger">
          <p><strong>Étape 1 sur 2 : garde une copie.</strong> Après la suppression, il ne restera rien sur le serveur. Exporte d'abord tes données si tu veux les conserver.</p>
          <div className="actions">
            <Link className="bouton" to="/sauvegarde">Aller à Sauvegarde et exports</Link>
            <button className="bouton danger" onClick={() => setEtape(2)}>Continuer sans exporter, ou export déjà fait</button>
            <button className="bouton" onClick={() => setEtape(0)}>Annuler</button>
          </div>
        </div>
      ) : (
        <form className="bandeau danger" onSubmit={supprimerCompte}>
          <p><strong>Étape 2 sur 2 : confirmation définitive.</strong></p>
          <div className="champ">
            <label htmlFor="x-mot">Écris SUPPRIMER en majuscules</label>
            <input id="x-mot" type="text" value={mot} onChange={(e) => setMot(e.target.value)} autoComplete="off" />
          </div>
          <div className="champ">
            <label htmlFor="x-mdp">Mot de passe du compte</label>
            <input id="x-mdp" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="actions">
            <button className="bouton danger" type="submit" disabled={mot !== 'SUPPRIMER' || !mdp || occupe || !etat.enLigne}>Supprimer définitivement mon compte</button>
            <button className="bouton" type="button" onClick={() => setEtape(0)}>Annuler</button>
          </div>
          {!etat.enLigne && <p className="petit">Connexion Internet nécessaire.</p>}
        </form>
      )}
    </section>
  );
}

export function PageReglages() {
  return (
    <div className="etroit">
      <h1>Réglages</h1>
      <Compte />
      <Synchro />
      <Apparence />
      <TypesRelation />
      <Corbeille />
      <Effacement />
      <p className="doux petit">
        Atlante {VERSION_APP}. Installer l'app : sur iPhone, Safari, bouton Partager, « Sur l'écran d'accueil » ; sur ordinateur, icône « Installer » dans la barre d'adresse de Chrome ou Edge.
      </p>
    </div>
  );
}
