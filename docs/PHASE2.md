# Pages et carnets — Phase 2

L’interface Vue conserve le contrat DataStore sans import Electron. Une migration additive version 2 conserve les données de la Phase 1. Quitter TaskFlow et sauvegarder le dossier de profil avant mise à niveau reste conseillé ; la sauvegarde automatique appartient à la Phase 4.

## Utilisation

Dans Carnets, créer un carnet, une section, puis une page. Enregistrer avec le bouton ou Ctrl+S. Une confirmation protège les modifications non enregistrées lors d’un changement de page/vue. Les sauvegardes utilisent un numéro de révision ; une modification concurrente impose un rechargement, jamais un écrasement silencieux.

Tiptap propose titres, gras, italique, listes, checklists, blocs de code, tableaux et images PNG/JPEG/WebP locales (2,5 Mo par fichier ; 8 Mo de JSON par page). Les images sont embarquées dans la page, pas récupérées depuis Internet. Les liens arbitraires et scripts ne sont pas autorisés dans le format sauvegardé.

Les boutons [[Page]] et @Tâche, ainsi que la saisie de [[ suivie d’un nom ou @ suivie d’un nom, ouvrent un sélecteur. Les références utilisent des identifiants stables. La section Références indique les éléments supprimés.

Chaque ligne de checklist peut devenir une tâche. Ajouter une tâche existante crée une ligne liée. Les coches et le statut terminé sont synchronisés dans les deux sens. La complétion d’une tâche parente reste refusée si ses sous-tâches ne sont pas terminées. Supprimer une page/ligne ne supprime pas sa tâche. Une tâche récurrente liée conserve le lien vers son occurrence originale ; la prochaine occurrence reste indépendante.

La recherche globale (bouton Tout rechercher ou Ctrl+Maj+F) couvre le titre et le texte des pages ainsi que le titre et la description des tâches. Elle limite les résultats à 50 pages et 50 tâches. La recherche SQLite LIKE n’assure pas l’insensibilité complète aux accents Unicode.

## Contrat et canaux

DataStore : notesSnapshot, saveNotebook, saveSection, savePage, deleteNote, restoreNote, linkChecklist, searchAll. Canaux IPC `notes:<nom de méthode>` ; même vérification d’origine et validation côté processus principal que pour les tâches. Aucun SQL ni chemin arbitraire envoyé par le renderer.

## Limites à conserver visibles

Sauvegarde explicite, pas de collaboration temps réel. Le snapshot des notes charge les contenus : une très grande collection nécessitera pagination et chargement différé. Les captures et l’installeur doivent être contrôlés avant validation utilisateur de Phase 2. Aucun mail/OAuth ajouté à cette phase.
