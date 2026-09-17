# TaskFlow — Phase 1

Application Windows française de gestion des tâches, avec interface Vue portable vers le web. Monorepo pnpm : `apps/desktop`, `packages/ui`, `packages/core`, `packages/data`.

**Sources Phase 1 implémentées ; jalons Electron et installation Windows à vérifier.** Consulter `docs/VALIDATION.md`. Les phases 2–4 attendent la validation utilisateur et le passage de tous les tests du jalon précédent. Aucun installeur non vérifié n’est présenté comme fonctionnel.

## Prérequis Windows

Windows 10/11 x64, Node.js 24, pnpm 11.19.0 et Git. Pour compiler better-sqlite3 si aucun prébuild Electron compatible n’existe : Python 3 et Visual Studio 2022 Build Tools, charge **Développement Desktop en C++** avec SDK Windows.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm dev
```

`pnpm test` reconstruit SQLite pour Node ; `pnpm test:e2e` et `pnpm dev` le reconstruisent pour Electron. Ne pas lancer ces commandes en parallèle dans le même dossier.

Pour générer l’installeur sur Windows :

```powershell
pnpm build
```

Sortie attendue lorsque le build réussit : `release/TaskFlow-Setup-0.1.0.exe`.
`pnpm compile` produit les bundles, **pas** un installeur. Le build croisé Linux nécessite Wine et un prébuild SQLite Windows pour la version exacte d’Electron ; à défaut il s’arrête explicitement. Un contrôle de format empêche d’embarquer un binaire Linux à sa place.

Le workflow `.github/workflows/windows.yml` exécute typecheck, Vitest, Playwright Electron, build NSIS et un test installation/lancement/SQLite. Il est fourni **sans exécution distante ni publication**. Pour l’utiliser, placer ce projet dans votre dépôt GitHub puis lancer le workflow. Les captures et rapports de tests deviennent alors ses artefacts.

## Fonctions Phase 1

Tâches, sous-tâches, échéance, rappel, priorité P1–P4, urgence, importance, effort, projet, étiquettes, description, statuts, récurrence, commentaires et documents copiés localement. Suppression logique du sous-arbre avec annulation ; conflits de révision détectés. Les parents ne se terminent pas avant leurs sous-tâches.

Vues Aujourd’hui, À venir, Liste, Kanban, Calendrier mensuel, Matrice et Focus limité à trois tâches. Recherche titre/description, filtres, thèmes clair/sombre/système, panneau de détail, palette de commandes. Les déplacements ont un équivalent clavier dans les champs statut/échéance/urgent/important.

- `N` : créer une tâche ; `/` : rechercher ; `Ctrl+K` : commandes.
- `E` : terminer/rouvrir la sélection ; `Ctrl+Z` : annuler la dernière suppression.
- `Ctrl+Maj+Espace` : capture globale, si le raccourci n’est pas déjà pris.
- Exemple : `Relancer le client vendredi 10h #pro !haute`.

Grammaire déterministe : aujourd’hui/demain/après-demain, jours de semaine, `AAAA-MM-JJ`, heure `10h30`, `#étiquette`, `!1`–`!4`, `!haute`/`!moyenne`/`!basse`, chaque jour/semaine/mois/année. Les expressions non reconnues restent dans le titre.

Récurrence depuis l’échéance précédente lors de la complétion : conserve les fins de mois, ne saute pas les occurrences passées, ne clone pas les sous-tâches historiques. Une réouverture suivie d’une nouvelle complétion ne crée pas de doublon.

Fermer la fenêtre masque l’application dans le tray ; **Quitter** dans son menu arrête l’application. Les rappels sont contrôlés toutes les 15 secondes lorsque TaskFlow tourne. Une fois fermé, TaskFlow n’exécute aucun rappel : ils sont repris au prochain lancement. Les notifications natives doivent encore être vérifiées sur Windows.

## Données et mises à jour

Dossier `%APPDATA%/TaskFlow` : `taskflow.db` et `attachments`. Le profil de test est isolé dans un dossier temporaire. Aucun compte cloud n’est nécessaire en Phase 1. Pour copier manuellement la base SQLite WAL, quitter l’application puis copier tout son dossier. La sauvegarde automatique appartient à Phase 4.

Documents limités à 25 Mo, PDF, PNG/JPEG/WebP, texte/CSV, DOCX/XLSX/PPTX. Le chemin n’est jamais fourni par le renderer ; une boîte de dialogue native sélectionne le fichier et une confirmation précède son ouverture externe.

Le serveur de mise à jour est facultatif : définir `TASKFLOW_UPDATE_URL` sur une URL HTTPS avant la compilation, puis y héberger `latest.yml`, `.exe` et `.blockmap`. Sans URL, aucun appel de mise à jour automatique. Téléchargement et redémarrage demandent confirmation. Signature Windows configurable via les secrets `CSC_LINK` et `CSC_KEY_PASSWORD` d’electron-builder, jamais enregistrés dans le dépôt. Aucun serveur ni certificat n’est inventé dans ce projet.

## Architecture et reprise

`DataStore` est asynchrone et injecté dans Vue. SQLite reste dans le processus principal ; un futur `ApiDataStore` FastAPI pourra remplacer le bridge sans réécrire les vues. `DesktopHost`, facultatif, isole les fonctions natives. Aucun import Electron dans UI/core. Contrat, SQL et IPC sont documentés dans `docs/ARCHITECTURE.md` et leurs fichiers TypeScript.

Avant reprise : lire `AGENTS.md`, `PLAN.md`, `PROGRESS.md`. Le projet a été reconstruit après un effacement du filesystem temporaire ; les tests doivent correspondre à cette reconstruction. Les sources et leur archive de reprise sont enregistrées durablement. Ne pas cocher les jalons non exécutés et ne pas créer de rapport final avant les critères complets.

L’archive contient aussi `taskflow-history.bundle` pour conserver les commits. Pour rétablir ce dépôt dans un autre dossier : `git clone taskflow-history.bundle taskflow-git`.
