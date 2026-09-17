# Validation Phase 1

Preuve : [workflow Windows du 17 septembre 2026](https://github.com/Txerus/Taskflow/actions/runs/35264673781), commit `f7b27276cab7ed8dfa78f8b066d9beba52121b39`.

| Vérification | État |
|---|---|
| Métier, parsing et dates | 17 tests Vitest réussis sous Windows |
| SQLite et migrations | 10 tests Vitest réussis sous Windows |
| Vue et régression IPC | 15 tests Vitest réussis sous Windows |
| TypeScript et compilation | Réussis |
| Playwright Electron | 6 parcours réussis |
| Captures clair/sombre 1280×800 et 1920×1080 | Générées par le parcours automatisé ; revue visuelle encore ouverte |
| Installeur NSIS | pnpm build réussi |
| Installation et lancement | Installation silencieuse, présence du binaire, fenêtre et création SQLite vérifiées sur runner Windows |
| Rappels, tray, raccourci, démarrage automatique | Validation manuelle native encore ouverte |
| Mise à jour entre versions | Serveur et certificat non configurés ; test ouvert |

## Corrections issues de la CI

- Nom accessible explicite du champ Priorité.
- Normalisation des données réactives Vue avant le passage IPC : évite « An object could not be cloned » lors des déplacements et changements de statut. Régression sur tâche récurrente avec étiquettes ; le mock exige un objet clonable.
- Déplacement par souris depuis la marge des cartes et attente de persistance de la prochaine occurrence.
- Cible calendrier identifiée par sa date après dépôt, plutôt que par une sélection dynamique des cases vides.

## Limites

Le test d’installation valide le runner Windows, pas encore le poste personnel de l’utilisateur. L’installeur n’est pas signé avec un certificat de production. Les captures n’ont pas été inspectées visuellement pendant cette session (environnement local indisponible). La Phase 1 attend sa revue visuelle et la validation utilisateur. Les phases 2 à 4 restent non implémentées ; aucun RAPPORT_FINAL n’est créé.

Les anciens journaux Linux dans docs/evidence conservent les blocages historiques, désormais dépassés par la validation Windows ci-dessus.
