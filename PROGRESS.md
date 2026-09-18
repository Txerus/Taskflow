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

## Validation Windows réussie — 17 septembre 2026
Run https://github.com/Txerus/Taskflow/actions/runs/35264673781 (commit f7b27276cab7ed8dfa78f8b066d9beba52121b39) : TypeScript, 42 tests Vitest, 6 parcours Electron, pnpm build et test NSIS installation/lancement/SQLite réussis. Dernière correction de test : cibler la date stable du calendrier, et non une liste de cases vides qui change après le dépôt. Captures clair/sombre produites automatiquement ; revue visuelle humaine et tests natifs tray/rappels/mise à jour restent ouverts. Phase 2 non commencée.

## Phase 2 autorisée — 17 septembre 2026
L’utilisateur confirme « parfait je valide continue ». Validation de Phase 1 enregistrée ; Phase 2 autorisée. La revue visuelle indépendante et les contrôles manuels natifs restent consignés comme non effectués, sans les confondre avec cet accord.
Plan Phase 2 détaillé : migration additive, contrat DataStore/IPC, éditeur Tiptap, sauvegarde/révisions, checklist liée, références pages/tâches, recherche et parcours de non-régression.
Blocage de cette reprise : l’environnement d’exécution est signalé unavailable et aucun outil terminal/filesystem n’est exposé. GitHub reste accessible ; le plan et ce journal sont enregistrés dans le dépôt. Aucun code Phase 2 n’est annoncé comme implémenté. Reprise nécessaire dans un environnement de développement actif pour installer/verrouiller Tiptap, exécuter les tests locaux et inspecter le rendu. Ne pas redemander la validation de Phase 1.

## Phase 2 — implémentation du 18 septembre 2026
Environnement réactivé, correctifs Windows récupérés depuis GitHub avant développement. Tiptap 3.31.3 installé avec lockfile. Migration 2 additive : carnets, sections, pages, liens checklist/tâche ; transactions, révisions et suppression/restauration des sous-arbres. Validation de contenu bornée, pas d’image distante ni de marque de lien arbitraire.
Interface : navigation carnets/sections/pages, Tiptap, titres/listes/checklists/tableaux/code/images locales, sauvegarde explicite Ctrl+S et protection des brouillons, liens [[page]] et @tâche, recherche globale Ctrl+Maj+F. Checklist vers tâche et ajout de tâche existante avec synchronisation bidirectionnelle. La suppression d’une note ne supprime pas les tâches liées.
53 tests Vitest réussis et TypeScript réussi localement. Trois parcours Electron Phase 2 ajoutés aux six parcours Phase 1. Version cible 0.2.0. Validation Electron/Windows et revue des captures encore à exécuter : ne pas considérer la phase livrée à ce stade. Phase 3 non commencée.
Design : compétences frontend-design et ui-ux-pro-max utilisées en respectant les tokens existants et la densité bureau. Les compétences Impeccable/web-design-guidelines/no-slop-ui citées par AGENTS.md ne sont pas disponibles ; DESIGN.md reste la référence.


## Phase 2 — validation Windows et revue visuelle du 18 septembre 2026
Run final https://github.com/Txerus/Taskflow/actions/runs/35329757309 (commit 1aee9c1af3f4825e48be249464594d666a4e28be) : installation des dépendances, TypeScript, Vitest, les 9 parcours Playwright Electron, build 0.2.0, création de l’installeur NSIS et smoke test installation/lancement réussis sous Windows. La migration Phase 1 → Phase 2 et la conservation des données sont couvertes par les tests.

Corrections issues de la validation : réacquisition du locator Tiptap après redémarrage Electron ; fermeture de la recherche globale sur la page courante ; reliaison d’une checklist après suppression de sa tâche ; protection des brouillons sur navigation sans effet et suppression annulée ; raccourcis limités au contexte visible ; Tiptap ne marque plus une page comme modifiée lors du simple basculement busy/editable. Le dernier défaut visuel trouvé était le sélecteur de fichier natif Windows affiché en anglais ; il a été remplacé par un contrôle TaskFlow français « Choisir une image » et couvert par E2E.

Revue visuelle effectuée sur les captures Carnets clair/sombre en 1280×800 et 1920×1080. Aucun débordement horizontal global détecté par le parcours automatisé. Les artefacts du run final contiennent l’installeur Windows, les rapports Playwright et les captures. Toutes les cases techniques de Phase 2 sont validées ; seule la validation utilisateur de Phase 2 reste ouverte. Phase 3 ne doit pas commencer avant cet accord.
