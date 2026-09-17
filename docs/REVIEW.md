# Revue de phase 1 et récupération

## Portée et preuves

Revue indépendante des sources de `packages/core`, `packages/data`, `packages/ui` et `apps/desktop`, en tenant compte d’AGENTS.md, PRODUCT.md et DESIGN.md. Aucune modification du code par le relecteur. L’environnement ne permettait pas de lancer Electron : aucune exécution Electron, capture ou validation visuelle n’a été réalisée par cette revue.

Le 17 septembre 2026, la réinitialisation de l’environnement a effacé `/workspace/scratch/071991141ae6/taskflow`. Le relecteur a confirmé que le répertoire était absent et qu’aucune archive ne pouvait être récupérée depuis son contexte d’exécution. Ces documents ont été reconstruits à partir de l’historique ; l’agent principal a ensuite annoncé la reconstruction des sources terminée.

L’agent principal avait indiqué **39 tests Vitest réussis**, ainsi que des passes de typecheck et compilation réussies avant une dernière passe prévue. Ce sont uniquement des preuves rapportées de l’ancienne exécution, pas des résultats exécutés par le relecteur ni une validation des sources reconstruites. Rejouer les contrôles et enregistrer leurs résultats actuels séparément.

## Constats et dernière relecture avant effacement

| Priorité | Constat initial | Dernier verdict source avant effacement |
|---|---|---|
| P1 | Le watcher du détail écrasait un brouillon à chaque rafraîchissement ou mutation de la tâche sélectionnée. | Partiellement corrigé : sources de watch séparées, révision d’édition et brouillon de référence ajoutés ; défaut résiduel de désynchronisation décrit ci-dessous. |
| P2 | Le calendrier acceptait les drops mais ses tâches ne pouvaient pas initier un déplacement. | Corrigé dans les sources : attribut draggable et payload d’identifiant ajoutés. Le test vérifiait la présence de l’attribut, sans parcours Electron exécuté. |
| P2 | La date d’Aujourd’hui était calculée une seule fois et restait figée après minuit. | Corrigé dans les sources : horloge réactive, intervalle de 30 secondes, actualisation au focus, filtres et classement réactifs. |
| P2 | Un commentaire non soumis suivait l’utilisateur vers une autre tâche. | Partiellement corrigé : champs auxiliaires inclus dans dirty et vidés au changement de tâche ; désynchronisation résiduelle possible. |
| P2 | « CHAQUE MOIS » était reconnu mais transformé en récurrence quotidienne à cause d’une comparaison sensible à la casse. | Corrigé dans les sources : normalisation lowercase et tests de casse ajoutés. |

Ces verdicts concernent uniquement les fichiers relus avant la perte de l’environnement. Ils ne sont pas automatiquement transférables à la reconstruction.

## Défaut résiduel historique

Dans l’ancienne version corrigée, `discardDraft()` passait `editorDirty` à faux sans réinitialiser le vrai brouillon. Deux reproductions restaient possibles :

1. Modifier A, recliquer A et accepter l’abandon. La sélection reste identique ; le watcher ne réinitialise aucun champ. Le texte reste visible alors que la protection est désactivée.
2. Saisir seulement un commentaire puis accepter « Terminer A ». La révision change mais l’identité ne change pas ; le commentaire n’est pas vidé. Le calcul dirty reste vrai sans transition, donc son watcher ne rétablit pas le drapeau.

Correction attendue : rendre la sélection identique inerte et réinitialiser explicitement tous les champs concernés après un abandon confirmé. La protection doit refléter l’état réel, y compris après un échec de mutation. Tester les chemins d’acceptation, de refus, de sélection identique et de commentaire seul, en plus du rafraîchissement et de la création d’une sous-tâche.

## Relecture ciblée après reconstruction — 17 septembre 2026

Les deux points résiduels ci-dessus sont **résolus dans les sources relues**. Périmètre : `packages/ui/src/store.ts`, `packages/ui/src/components/TaskDetail.vue` et les tests associés dans `packages/ui/src/ui.test.ts`.

| Point résiduel | Verdict actuel | Éléments vérifiés dans les sources |
|---|---|---|
| Protection désactivée en recliquant la tâche sélectionnée | Résolu | `select()` retourne immédiatement lorsque l’identifiant ne change pas. Le test vérifie l’absence de confirmation et le maintien de `editorDirty` à vrai. |
| Commentaire conservé après abandon accepté puis complétion | Résolu | `discardDraft()` incrémente `resetDraftSignal` après confirmation. Le watcher du détail observe ce signal, réinitialise brouillon, référence, révision et rappel, puis vide commentaire et sous-tâche. Le test vérifie le champ commentaire vide, le retour à un état propre et la réactivation de la protection lors d’une nouvelle saisie. |

L’agent principal rapporte **41 tests Vitest réussis après reconstruction : 17 core, 10 SQLite et 14 UI**. Ce résultat actuel est distinct des 39 tests historiques ; il n’a pas été réexécuté par le relecteur. La relecture confirme les corrections des deux scénarios précis, sans nouvelle revue exhaustive des autres composants et sans exécution Electron ni validation visuelle.

## Sécurité et packaging

Aucun contournement IPC concret ni défaut de packaging n’a été établi par la première inspection source. Les contrôles relus incluaient identité de l’émetteur et frame principale, preload isolé, canaux explicites, schémas d’entrée et chemins de pièces jointes appartenant à l’application.

L’agent principal a ensuite signalé l’ajout d’une garde vérifiant le binaire PE Windows, avec blocage explicite du build Linux si le prébuild Windows manque. Cette garde n’a pas fait l’objet de la relecture ciblée des cinq constats ci-dessus et doit être vérifiée après reconstruction.

L’installation Windows, le chargement du module SQLite natif, les rappels, la zone de notification, le raccourci global et les parcours Electron demeurent à valider en exécution réelle. Les tests existants, leurs noms ou une compilation réussie ne remplacent pas ces preuves. Ne pas présenter les captures attendues comme produites.
