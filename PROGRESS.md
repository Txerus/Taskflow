# PROGRESS — TaskFlow
## 2026-09-17 : session initiale
Architecture et sources Phase 1 écrites. Avant la réinitialisation : 39 tests Vitest réussis, typecheck et compilation réussis. Ce résultat concerne les anciens fichiers ; il ne valide pas automatiquement la reconstruction.
Revue source : correction des brouillons, récurrence majuscule, calendrier draggable, journée réactive ; deux cas résiduels d’abandon doivent être corrigés par un signal explicite de reset.
Bloquants observés : Electron ne démarre pas dans le runtime Linux (sockets locaux / rendu refusés). Build Windows incomplet : absence Wine initialement, puis prébuild better-sqlite3 Windows indisponible pour Electron 44.4.1. Un ancien essai embarquait un module ELF Linux : ne jamais livrer ce paquet. Garde PE et compilation Windows native à conserver.
## Reprise / récupération
Le dossier local a été effacé avant sauvegarde durable. Reconstruction depuis le code de la conversation ; aucun fichier utilisateur supprimé volontairement. Les tests sont à relancer et une archive durable est prioritaire.
Phases 2–4 non commencées : validation utilisateur et jalon Windows obligatoires. Aucun OAuth requis pour Phase 1. Pas de rapport final prématuré.

## Reprise — sources restaurées et contrôles réexécutés
Fait : reconstruction du monorepo complet de Phase 1, sauvegarde durable de l’archive, 41 tests Vitest réussis (17 métier, 10 SQLite, 14 UI), TypeScript et compilation réussis. Corrections finales de l’abandon de brouillon couvertes par tests et revue source indépendante. Six parcours Electron et un workflow Windows avec installation NSIS sont présents. README, contrat DataStore, SQL, canaux IPC et guide de validation sont inclus.

Essais réels : Playwright Electron échoue avant ouverture, faute de serveur X / DISPLAY (1 échec, 5 non exécutés). Installation Xvfb impossible dans ce runtime : catalogue incomplet et permissions système refusées. `pnpm build` réussit typecheck et bundling, puis échoue faute de prébuild better-sqlite3 Windows pour Electron 44.4.1. La garde empêche d’embarquer le module Linux dans un faux installeur Windows. Journaux dans docs/evidence. Aucun .exe validé, aucune capture visuelle réelle.

En cours / bloquant : exécuter la CI fournie sur un hôte Windows, corriger les éventuels échecs E2E, contrôler visuellement et vérifier installation, tray, notifications et mises à jour. Aucun dépôt TaskFlow connecté trouvé à la recherche ; aucune publication distante effectuée. Décision nécessaire pour continuer les validations natives : fournir un dépôt cible ou un environnement Windows.

Décisions : rester en Phase 1 ; ne pas déclarer la phase terminée ni démarrer Tiptap/OAuth avant les jalons et la validation utilisateur. Les commits intermédiaires préservent le code mais ne représentent pas un jalon E2E réussi. Archive contenant sources, lockfile, documentation, preuves et bundle Git pour reprise.

## Publication GitHub — 17 septembre 2026
Dépôt créé par l’utilisateur : https://github.com/Txerus/Taskflow. Les 58 fichiers du projet ont été transférés et leur présence vérifiée sur main (commit e0797e264d3e12546335f6f3163bef00fe15367f). REQUIREMENTS.md ajouté. Publication par API : les anciens commits locaux restent dans l’archive de reprise, l’historique distant commence par l’import.
Le workflow Windows a démarré : https://github.com/Txerus/Taskflow/actions/runs/35253993511. Au dernier contrôle, le job est en cours ; tests et installeur non encore validés. Reprendre par la lecture du résultat et des journaux de ce workflow.

## Correction du premier workflow Windows
Run 35253993511 : Electron et SQLite démarrent sous Windows ; 4 parcours E2E passent, 2 échouent (libellé exact Priorité, déplacement Kanban). Le build NSIS n’a pas été exécuté après cet échec. Ajout d’un nom accessible explicite à Priorité ; le test de déplacement démarre sur la marge de la carte hors boutons et effectue deux mouvements sur la cible avant de relâcher. Ajout d’une attente de persistance de la prochaine occurrence. Aucun test désactivé. Nouvelle validation complète demandée par le push. Environnement local indisponible : exécution déléguée au workflow Windows, résultat à contrôler.

Diagnostic run 35264054389 : dragstart et drop reçus ; la bannière affiche « An object could not be cloned ». Cause : change() transmet des proxies Vue imbriqués (récurrence/étiquettes) au bridge Electron. Correction : normalisation taskInputSchema.parse avant updateTask, comme dans save(). Le mock de test exige maintenant structuredClone(input), avec régression sur une tâche récurrente étiquetée. Diagnostics temporaires retirés ; les vrais déplacements souris restent testés.
