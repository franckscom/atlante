// Affiche un texte Markdown. Le HTML produit est nettoyé (DOMPurify) : un fichier importé
// ne peut pas glisser de script dans l'app.
import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

DOMPurify.addHook('afterSanitizeAttributes', (noeud) => {
  // Les liens s'ouvrent dans un nouvel onglet, sans donner accès à l'app à la page ouverte.
  if (noeud.tagName === 'A') {
    noeud.setAttribute('target', '_blank');
    noeud.setAttribute('rel', 'noopener noreferrer');
  }
  // Pas de chargement d'image distante : aucune requête vers un tiers à la simple lecture d'une fiche.
  if (noeud.tagName === 'IMG' && !/^data:/.test(noeud.getAttribute('src') ?? '')) {
    const remplacant = document.createElement('span');
    remplacant.textContent = `[image : ${noeud.getAttribute('alt') || noeud.getAttribute('src') || ''}]`;
    noeud.replaceWith(remplacant);
  }
});

export function Markdown({ texte }: { texte: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(texte ?? '', { async: false, breaks: true }) as string), [texte]);
  return <div className="lecture" dangerouslySetInnerHTML={{ __html: html }} />;
}
