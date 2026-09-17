# Prérequis de développement et compilation

## Windows

- Windows 10 ou 11, architecture x64.
- Git, Node.js 24 et pnpm 11.19.0 (version verrouillée dans package.json).
- Python 3.12 et Visual Studio 2022 Build Tools : charge « Développement Desktop en C++ », compilateur MSVC et SDK Windows. Ces outils permettent de compiler SQLite pour Electron lorsqu’aucun binaire précompilé n’est disponible.
- Accès réseau aux registres npm et aux téléchargements GitHub/Electron pendant l’installation et la compilation.
- Session graphique interactive pour les tests Electron.

## Installation

```powershell
git clone https://github.com/Txerus/Taskflow.git
cd Taskflow
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm dev
```

Exécuter les commandes successivement : les tests Node et Electron utilisent des versions natives différentes de SQLite.

## Livraison Windows

```powershell
pnpm build
pwsh -File scripts/smoke-windows.ps1
```

L’installeur attendu est `release/TaskFlow-Setup-0.1.0.exe`. Le workflow `.github/workflows/windows.yml` automatise les contrôles sur Windows et conserve les résultats dans l’artefact `TaskFlow-Windows`. Il se déclenche sur les envois à `main` ou manuellement depuis GitHub Actions.

Les dépendances JavaScript sont déclarées dans les fichiers `package.json` des packages et verrouillées par `pnpm-lock.yaml`. Aucun `requirements.txt` Python n’est nécessaire : Python sert uniquement à la compilation native.

## Configuration facultative

Consulter `.env.example` et le README pour le serveur HTTPS de mises à jour. Ne jamais committer de certificat de signature, de mot de passe ou de jeton. Aucun identifiant OAuth n’est requis en Phase 1.

## État de validation

41 tests avaient réussi dans l’environnement Linux de reconstruction. Les tests graphiques et l’installation Windows restent à vérifier par la CI ; la présence du workflow ne constitue pas une validation. Voir `PROGRESS.md` et `docs/VALIDATION.md`.
