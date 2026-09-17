# Architecture de TaskFlow

## Statut du document

Description reconstruite depuis les sources relues avant la réinitialisation de l’environnement du 17 septembre 2026. L’ancien espace de travail a été effacé. Les sources en cours de reconstruction doivent être comparées à ce document ; il ne constitue pas une preuve que chaque mécanisme est déjà rétabli.

## Frontières

| Ensemble | Responsabilité |
|---|---|
| `packages/core` | Types métier, validation des entrées, dates locales, récurrence, classement et analyse de capture française |
| `packages/data` | Contrats de données et implémentation SQLite côté processus principal |
| `packages/ui` | Vue 3, Pinia, composants, sept vues, styles et tokens ; aucune dépendance Electron |
| `apps/desktop` | Processus principal Electron, preload, intégration Windows, hébergement du renderer et packaging |

Le renderer reçoit un contrat `DataStore` et un contrat d’hôte desktop par injection. Le cœur et l’interface doivent rester portables pour une future version web. Les opérations natives passent par l’hôte ; le renderer n’accède pas directement au système de fichiers ou à SQLite.

## Données et mutations

SQLite via `better-sqlite3`, dans le répertoire de données utilisateur. Migrations versionnées, clés étrangères actives, journal WAL et délai d’attente de verrouillage. Une base créée par une version ultérieure doit être refusée proprement.

Entités : tâches, projets, étiquettes, associations tâche-étiquette, commentaires, métadonnées de pièces jointes et préférences. Les tâches portent notamment un parent facultatif, une échéance locale, un rappel instantané, un statut, une récurrence et une révision.

Les entrées sont validées côté données, notamment identifiants, bornes et formats de dates. La révision protège contre les écritures périmées. Les opérations composées s’exécutent dans une transaction. Les cycles parent/enfant sont refusés, ainsi que la complétion d’un parent ayant du travail enfant non terminé.

Les suppressions sont logiques et portent un jeton de restauration. Supprimer un parent inclut ses descendants actifs ; restaurer ne doit pas ressusciter les descendants supprimés antérieurement. La récurrence génère au plus une occurrence suivante par tâche terminée. L’ancrage du jour du mois conserve une récurrence de fin de mois malgré février.

Les brouillons d’édition doivent conserver leur révision d’origine. Un rafraîchissement ne doit pas écraser un brouillon non enregistré. L’abandon confirmé doit réinitialiser les vrais champs, y compris commentaire et sous-tâche, et pas uniquement un booléen de protection.

## Frontière IPC

Preload isolé avec `contextBridge`, `contextIsolation`, sandbox et intégration Node désactivée dans le renderer. Surface explicite de méthodes ; aucun accès générique à `ipcRenderer` exposé. Chaque appel doit vérifier l’émetteur, la frame principale et l’URL du renderer autorisé, puis valider ses arguments côté processus principal/données.

Navigation et ouverture de fenêtres non autorisées sont refusées. Les permissions navigateur sont refusées. Une CSP borne les ressources ; les exceptions du serveur de développement doivent rester limitées à ce besoin.

## Pièces jointes et intégration desktop

Le sélecteur natif fournit le chemin source. Le processus principal vérifie extension et taille, puis copie le document dans un répertoire appartenant à l’application, sous un identifiant généré. La base conserve les métadonnées ; aucun chemin arbitraire ne vient du renderer. Une insertion échouée doit nettoyer la copie. L’ouverture utilise l’application système après confirmation.

Instance unique, zone de notification, capture globale et notifications de rappels sont des responsabilités Electron. Les rappels déjà signalés sont marqués ; tâches terminées ou supprimées exclues. Les préférences comprennent thème et lancement à l’ouverture de session. Mise à jour : vérifier la configuration, demander le téléchargement puis le redémarrage avant installation.

## Compilation et validation

Vite construit le renderer ; esbuild construit le processus principal et le preload ; Electron Builder produit l’installateur Windows NSIS. Les modules SQLite natifs doivent correspondre à la plateforme Windows et à l’ABI Electron cible. Une compilation JavaScript réussie ne prouve pas que l’installateur démarre.

Vitest couvre cœur, données et intégration Vue portable ; Playwright Electron doit couvrir parcours, persistance, isolation IPC et captures. Les preuves de l’ancienne exécution sont répertoriées dans `REVIEW.md`. Refaire les contrôles sur les fichiers reconstruits et sur Windows avant de considérer la livraison validée.
