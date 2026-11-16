// Champ pour choisir une fiche existante en tapant quelques lettres de son titre.
import { useMemo, useState } from 'react';
import { TYPES_FICHE, type Fiche, type TypeFiche } from '../../modele/types';
import { normaliser } from '../../utils/texte';
import { useDonnees } from '../donnees';

interface Props {
  onChoisir: (fiche: Fiche) => void;
  /** Fiches à ne pas proposer. */
  exclure?: string[];
  /** Limiter à certains types. */
  types?: TypeFiche[];
  placeholder?: string;
  id?: string;
}

export function SelecteurFiche({ onChoisir, exclure = [], types, placeholder = 'Chercher une fiche…', id }: Props) {
  const { ctx } = useDonnees();
  const [texte, setTexte] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const propositions = useMemo(() => {
    const q = normaliser(texte);
    if (!q) return [];
    return [...ctx.fiches.values()]
      .filter((f) => !exclure.includes(f.id) && (!types || types.includes(f.type)) && normaliser(f.titre + ' ' + f.auteur).includes(q))
      .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
      .slice(0, 12);
  }, [texte, ctx, exclure, types]);
  return (
    <div className="selecteur">
      <input
        id={id}
        type="search"
        value={texte}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setTexte(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 200)}
      />
      {ouvert && texte.trim() !== '' && (
        <ul className="suggestions">
          {propositions.length === 0 && <li className="doux petit" style={{ padding: 10 }}>Aucune fiche trouvée.</li>}
          {propositions.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChoisir(f);
                  setTexte('');
                  setOuvert(false);
                }}
              >
                {f.titre || 'Sans titre'} <span className="doux petit">({TYPES_FICHE[f.type]})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
