# Commercialisation OAuth — TaskFlow

## Objectif

TaskFlow Desktop est conçu comme un client natif multi-entreprises. Un même Client ID de production est utilisé par les clients. Chaque organisation cliente conserve le contrôle de son consentement Microsoft 365 / Google Workspace.

Les jetons OAuth restent chiffrés localement avec Electron safeStorage. Le cache mail reste local dans SQLite. Aucun mot de passe Microsoft/Google n'est demandé ou stocké par TaskFlow.

## Microsoft 365 — cible commerciale

### Inscription
- Type de comptes : multitenant (comptes professionnels/scolaires de n'importe quel tenant ; comptes personnels seulement si le produit les supporte réellement).
- Client natif/public : aucun client secret embarqué.
- OAuth Authorization Code + PKCE et navigateur système.
- Permissions Graph déléguées minimales utilisées par TaskFlow : User.Read, Mail.ReadWrite, Mail.Send.
- URI de redirection desktop loopback configurée selon les exigences Microsoft.

### Parcours client
1. L'utilisateur clique « Connecter Microsoft 365 ».
2. Si la politique du tenant autorise le consentement utilisateur, il consent et continue.
3. Si l'entreprise exige un administrateur, TaskFlow explique le blocage et fournit le nom de l'app, le Client ID et les permissions.
4. L'administrateur examine et approuve TaskFlow pour son organisation selon sa politique.
5. L'utilisateur recommence la connexion ; aucun nouveau build TaskFlow n'est nécessaire.

### Publisher Verification
Avant commercialisation :
1. disposer d'un domaine professionnel contrôlé par l'éditeur ;
2. disposer d'un tenant Microsoft Entra professionnel associé à l'éditeur ;
3. rejoindre et faire vérifier l'organisation dans Microsoft AI Cloud Partner Program / Partner Center afin d'obtenir le Partner One ID global approprié ;
4. vérifier le domaine personnalisé dans Entra et le définir comme Publisher domain de TaskFlow ;
5. s'assurer que le domaine correspond aux exigences du compte partenaire ;
6. dans App registrations > TaskFlow Desktop > Branding & properties, utiliser « Add Partner ID to verify publisher » ;
7. saisir le Partner One ID et terminer la vérification avec un compte autorisé et MFA ;
8. vérifier que le badge d'éditeur vérifié apparaît sur le consentement ;
9. tester dans un tenant client distinct, avec consentement utilisateur autorisé puis bloqué.

La vérification éditeur améliore la confiance et peut permettre le consentement utilisateur dans les tenants dont la politique n'autorise que les éditeurs vérifiés. Elle ne contourne jamais une politique qui exige explicitement un administrateur.

### Option de distribution supplémentaire
Une publication dans Microsoft Entra App Gallery peut être envisagée ensuite. Elle est distincte de Publisher Verification et demande sa propre validation, la documentation client, les logos, les informations de support/confidentialité et un Partner One ID.

## Google / Gmail — cible commerciale

TaskFlow utilise actuellement gmail.modify pour lire, traiter et modifier les messages. Ce scope Gmail est classé « restricted ».

Avant publication externe :
1. utiliser un projet Google Cloud de production séparé du projet de test ;
2. configurer Google Auth Platform > Branding avec nom, logo, e-mail de support et contacts développeur ;
3. disposer d'un site public sur un domaine contrôlé ;
4. publier sur ce domaine une page d'accueil TaskFlow, une politique de confidentialité et, de préférence, des conditions d'utilisation ;
5. déclarer les domaines autorisés et prouver leur propriété lorsque Google le demande ;
6. dans Data Access, ne déclarer que les scopes réellement utilisés ;
7. passer l'application de Testing à Production ;
8. ouvrir Verification Center > Prepare for Verification ;
9. justifier précisément chaque scope, notamment gmail.modify ;
10. fournir la vidéo de démonstration demandée montrant OAuth et l'usage réel des permissions ;
11. répondre aux demandes de l'équipe de vérification Google ;
12. vérifier dans Verification Center si une évaluation de sécurité supplémentaire s'applique à l'architecture de production.

Le cache actuel est local au poste et TaskFlow n'envoie pas le contenu Gmail vers un serveur TaskFlow. Cette propriété doit être décrite exactement dans le dossier de vérification et dans la politique de confidentialité ; elle ne doit pas être présentée comme une exemption automatique avant confirmation de Google.

## Pages publiques à préparer avant vente

- site officiel TaskFlow sur un domaine de l'éditeur ;
- page produit / accueil ;
- politique de confidentialité expliquant Microsoft Graph, Gmail, cache local, chiffrement, suppression et révocation ;
- conditions d'utilisation / CGV adaptées au mode de vente ;
- page support avec contact professionnel ;
- documentation administrateur Microsoft 365 ;
- documentation Google Workspace ;
- procédure de suppression des données locales et de déconnexion des comptes.

Les textes juridiques définitifs doivent correspondre au fonctionnement réel du produit et au statut juridique de l'éditeur.

## Critères Phase 3 liés à la commercialisation

- [x] OAuth desktop PKCE et stockage sécurisé local
- [x] Client Microsoft multi-tenant côté code (/common)
- [x] Explication intégrée du blocage par consentement administrateur
- [x] Informations IT affichées dans TaskFlow en cas de blocage
- [x] Détection locale des demandes e-mail et suggestion de tâche sans envoi à un tiers
- [ ] Publisher domain Microsoft configuré
- [ ] Organisation / Partner One ID Microsoft vérifiés
- [ ] Badge Microsoft Verified Publisher obtenu
- [ ] Google Auth Platform en Production
- [ ] Vérification OAuth Google du scope Gmail restricted obtenue
- [ ] Connexion réelle validée dans un tenant Microsoft externe
- [ ] Connexion Gmail de production validée
