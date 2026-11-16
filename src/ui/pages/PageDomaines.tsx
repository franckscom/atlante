// Domaines : liste libre et modifiable.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { bd } from '../../donnees/db';
import { creer, modifier, supprimerDomaine } from '../../donnees/depot';
import type { Domaine } from '../../modele/types';
import { confirmer } from '../composants/Confirmation';
import { useDonnees } from '../donnees';

export function PageDomaines() {
  const { domaines, corpus } = useDonnees();
  const [nom, setNom] = useState('');
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null);
  const compte = (id: string) => corpus.fiches.filter((f) => f.domaine_ids.includes(id)).length;

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return;
    await creer(bd, 'domaines', { nom: nom.trim(), description: '' });
    setNom('');
  };
  const supprimer = async (d: Domaine) => {
    const n = compte(d.id);
    const ok = await confirmer({
      titre: 'Supprimer ce domaine ?',
      message: `« ${d.nom} » sera supprimé.` + (n ? ` ${n} fiche${n > 1 ? 's' : ''} le porte${n > 1 ? 'nt' : ''} : elles sont conservées, sans ce domaine.` : ''),
      bouton: 'Supprimer',
      danger: true,
    });
    if (ok) await supprimerDomaine(bd, d.id);
  };

  return (
    <div className="etroit">
      <h1>Domaines</h1>
      <p className="doux">Une fiche peut appartenir à plusieurs domaines. Renomme, ajoute ou supprime-les librement.</p>
      <ul className="liste">
        {domaines.map((d) => (
          <li key={d.id}>
            {edition?.id === d.id ? (
              <form
                className="ligne"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (edition.nom.trim()) await modifier(bd, 'domaines', d.id, { nom: edition.nom.trim() });
                  setEdition(null);
                }}
              >
                <input type="text" value={edition.nom} onChange={(e) => setEdition({ id: d.id, nom: e.target.value })} autoFocus aria-label="Nom du domaine" style={{ flex: 1, width: 'auto' }} />
                <button className="bouton principal" type="submit">Enregistrer</button>
                <button className="bouton" type="button" onClick={() => setEdition(null)}>Annuler</button>
              </form>
            ) : (
              <div className="ligne">
                <Link className="titre-fiche" to={`/fiches?domaine=${d.id}`}>{d.nom}</Link>
                <span className="doux petit">{compte(d.id)} fiche{compte(d.id) > 1 ? 's' : ''}</span>
                <span className="droite">
                  <button className="bouton discret" onClick={() => setEdition({ id: d.id, nom: d.nom })}>Renommer</button>
                  <button className="bouton discret" onClick={() => supprimer(d)}>Supprimer</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="actions" onSubmit={ajouter}>
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouveau domaine…" aria-label="Nom du nouveau domaine" style={{ flex: 1, width: 'auto' }} />
        <button className="bouton principal" type="submit">Ajouter</button>
      </form>
    </div>
  );
}
