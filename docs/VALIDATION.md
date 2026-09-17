# Validation Phase 1

Ce rapport distingue le code présent, les tests exécutés et les jalons bloqués. Il ne remplace pas le RAPPORT_FINAL attendu après les quatre phases.

| Vérification | État |
|---|---|
| Modèles, parsing et dates | 17 tests Vitest réussis après reconstruction |
| SQLite, migrations, intégrité, récurrence, rappels | 10 tests Vitest réussis après reconstruction |
| Composants Vue, sept vues, brouillons, calendrier, minuit | 14 tests Vitest réussis après reconstruction |
| TypeScript strict | Réussi après reconstruction |
| Compilation Vite/esbuild | Réussie après reconstruction |
| Playwright Electron | Échec avant ouverture : serveur X / DISPLAY absent ; 1 échec, 5 non exécutés. Voir evidence/electron-e2e.log |
| Captures visuelles réelles | Non réalisées ; test automatisé fourni |
| Build installeur Windows | Échec : prébuild SQLite Windows absent pour Electron 44.4.1 ; voir evidence/windows-build.log |
| Installation et lancement Windows | Non exécutés dans ce runtime Linux |
| Rappels, tray, raccourci, auto-démarrage Windows | Code présent, validation native ouverte |
| Auto-update de version à version | Code présent, serveur/certificat non configurés, test ouvert |

## Limites et décisions

- Phase 2 Tiptap/pages, Phase 3 OAuth/mails et Phase 4 bonus ne sont pas implémentées. Elles ne doivent pas être cochées avant leur réalisation.
- Aucune fausse capture ni fichier .exe renommé : seuls les résultats réels sont annoncés.
- Tests Vue sous happy-dom : vérifient comportements et DOM, pas le rendu de Chromium. Ils ne remplacent pas Playwright Electron ou l’installation Windows.
- Six parcours Electron sont écrits. Un profil temporaire isole les données ; `--no-sandbox` est réservé au lanceur des tests Linux root. Le code de production conserve sandbox et contextIsolation.
- Le visualiseur interne Design System utilise les vrais composants et tokens. Le polish visuel final reste ouvert.
- La revue source séparée a identifié cinq points matériels : brouillons, déplacement calendrier, changement de jour, commentaires non envoyés, récurrence en majuscules. Les corrections sont couvertes par les tests, dont deux tests d’abandon confirmé ajoutés à la reprise.
- Le workflow Windows est un fichier local, pas une exécution de CI déjà obtenue.

## Suite nécessaire pour fermer le jalon

1. Exécuter le workflow ou les commandes du README sur Windows.
2. Corriger tout échec Electron, observer les captures et le parcours complet.
3. Vérifier l’installation NSIS et le lancement ; tester rappels et tray.
4. Mettre à jour PLAN/PROGRESS avec les preuves puis obtenir la validation de Phase 1.

Le gestionnaire système ne permet pas d’ajouter Xvfb : paquet absent du catalogue et actualisation refusée par les permissions du runtime. Aucun dépôt TaskFlow connecté n’a été trouvé pour exécuter la CI Windows.
