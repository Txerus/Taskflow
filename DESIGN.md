# TaskFlow — système visuel

## Intention

Un outil professionnel dense et sobre, en français, pour le suivi d’affaires industrielles. Références d’usage : Linear, Things 3, Superhuman. Aucune présentation marketing, aucun indicateur décoratif. Signature : repère de priorité dans chaque ligne et panneau d’édition continu à droite.

## Couleurs

Palette de neutres légèrement froids en OKLCH, avec un seul accent pétrole. Les priorités P1–P4 ont des couleurs fonctionnelles sobres et des libellés explicites ; leur signification ne dépend jamais uniquement de la couleur. Toutes les couleurs sont des tokens CSS.

Clair : fond blanc, navigation gris froid, texte sombre, séparateurs fins, accent pétrole foncé portant du texte clair. Sombre : surfaces charbon distinctes, texte clair, bordures perceptibles et accent pétrole clair portant du texte sombre. Le choix système suit les changements du système d’exploitation.

Les valeurs ci-dessous sont celles du thème clair précédemment relu, comme référence de reconstruction et non comme validation de contraste :

| Token | Valeur de référence |
|---|---|
| Fond | `oklch(99% .003 240)` |
| Surface | `oklch(96.8% .006 240)` |
| Survol | `oklch(93.5% .01 240)` |
| Texte | `oklch(25% .015 240)` |
| Texte secondaire | `oklch(47% .02 240)` |
| Bordure | `oklch(87% .012 240)` |
| Accent | `oklch(43% .075 180)` |
| Sur accent | `oklch(99% .002 180)` |
| Sélection | `oklch(93% .025 180)` |

## Typographie et densité

IBM Plex Sans pour son dessin lisible et technique, corps de 14 px ; IBM Plex Mono pour les dates courtes, priorités et raccourcis, avec chiffres tabulaires. Polices embarquées localement pour fonctionner hors ligne. Pas de chargement distant ni de substitution implicite par Inter ou Roboto.

Grille de 4 px, navigation cible de 224 px, panneau de détail cible de 336 px, lignes compactes autour de 48–56 px selon leur contenu. Rayons modestes de 6 px ; bordures plutôt que cartes imbriquées. Ombres réservées aux éléments flottants. Espacements, tailles structurantes et rayons sont des tokens.

## Interaction

Un seul jeu d’icônes : Lucide, tailles et traits cohérents. Barre de titre intégrée avec commandes de fenêtre nommées. Focus visible de 2 px, champs étiquetés, contrôles accessibles au clavier et contraste WCAG AA à vérifier. Dialogues accessibles avec gestion du focus et d’Échap. Dates et heures en `fr-FR`.

Transitions courtes de 140 ms, désactivées avec `prefers-reduced-motion`. Déplacement de tâches avec retour visuel de cible. Alternative clavier via l’édition des mêmes propriétés. Chargement, état vide utile et erreur avec action de reprise pour chaque vue.

| Raccourci | Action |
|---|---|
| `Ctrl+K` | Palette de commandes |
| `N` | Capture hors champ de saisie |
| `/` | Recherche hors champ de saisie |
| `E` | Terminer ou rouvrir la tâche sélectionnée hors saisie |
| `Ctrl+Z` | Annuler la suppression hors saisie |
| `Ctrl+Maj+Espace` | Capture globale Windows |

## Interdits et validation

Pas de dégradés violet/bleu, glassmorphism, gros rayons omniprésents, emojis comme icônes, faux chiffres ou textes vagues. Les boutons nomment l’action : « Créer la tâche », « Enregistrer les modifications ».

Ce document a été reconstruit après l’effacement de l’espace de travail le 17 septembre 2026. Aucune capture ou validation visuelle Electron n’est disponible dans le contexte de revue. Vérifier les thèmes clair/sombre, les sept vues, les dialogues et le panneau de détail dans une exécution réelle après reconstruction.
