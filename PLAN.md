# PLAN — TaskFlow
## Préparation
- [x] Architecture monorepo et décision de séparation UI / Electron
- [x] Plan, journal, règles de reprise
- [x] Restaurer les sources après réinitialisation de l’environnement
- [x] Vérifier à nouveau tests et compilation sur les fichiers restaurés
## Phase 1 — tâches
Les cases de réalisation indiquent le code présent ; les validations natives et visuelles restent des jalons séparés.
- [x] Métier : validation, parsing français, récurrence et priorité
- [x] DataStore, SQLite, migrations, intégrité, soft delete
- [x] Tâches, sous-tâches, projets, étiquettes, commentaires, documents
- [x] Sept vues : Aujourd’hui, À venir, Liste, Kanban, Calendrier, Matrice, Focus
- [x] Clavier, thèmes, palette, glisser-déposer, protection des brouillons
- [x] Shell Electron sécurisé, tray, rappels, capture, démarrage Windows
- [x] NSIS et configuration de mise à jour
- [x] Vitest et TypeScript réussis sur les sources finales
- [x] Playwright Electron réussi, captures clair/sombre 1280×800 et 1920×1080
- [ ] Revue visuelle et corrections
- [x] pnpm build produit un .exe ; installation et lancement Windows vérifiés
- [x] Validation utilisateur de Phase 1 — accord reçu le 17 septembre 2026
## Phase 2 — pages (autorisée le 17 septembre 2026)
- [x] Migration additive carnets > sections > pages, sans perte des tâches existantes
- [x] Contrats DataStore asynchrones, validation métier et canaux IPC dédiés
- [x] Création, renommage, déplacement et suppression/restauration des carnets, sections et pages
- [x] Navigation Vue et éditeur Tiptap : titres, tableaux, images, code et checklists
- [x] Sauvegarde avec révision, détection de conflits et protection du contenu non enregistré
- [x] Checklist ↔ tâche : lien stable, synchronisation du statut sans doublons
- [x] Liens [[page]] et @tâche : sélection, navigation et gestion des éléments supprimés
- [x] Recherche globale pages/tâches avec extraits et navigation
- [x] Tests Vitest : migration depuis Phase 1, contenu, conflits et liens
- [x] Tests Electron : rédaction, redémarrage, recherche, checklist et navigation
- [x] Revue visuelle clair/sombre, clavier et captures
- [x] Build Windows, installation et conservation des données Phase 1
- [x] Validation utilisateur de Phase 2 — accord reçu le 18 septembre 2026
## Phase 3 — mails
- [ ] Identifiants Azure / Google fournis par l’utilisateur
- [ ] OAuth PKCE loopback, tokens safeStorage
- [ ] Graph / Gmail, lecture, réponse et pièces jointes
- [ ] Cache hors-ligne et synchronisation
- [ ] Mail → tâche, règles et suggestions IA
- [ ] Attente de réponse et relance
- [ ] Connexion autorisée, tests, audits, build et validation
## Phase 4 — bonus
- [ ] Résumé matinal, time-blocking, revue hebdomadaire
- [ ] Pomodoro, suivi du temps, modèles
- [ ] Export/import et sauvegardes automatiques
- [ ] Tests, audits, installation vérifiée
## Livraison finale
- [ ] Parcours complet tâche / page / mail → tâche
- [ ] Toutes les cases réellement vérifiées
- [ ] RAPPORT_FINAL.md
