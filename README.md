# Krazy Dart App (KDA)

Application web statique, légère et en français pour compter les points aux fléchettes. Elle fonctionne sans compte, serveur applicatif, dépendance JavaScript ni base de données : les parties restent dans la mémoire de l'onglet et ne sont pas envoyées ailleurs. Son identité visuelle met en avant le trigramme **KDA** et le bleu cyan.

## Modes et saisie des lancers

- **301** avec options double in et double out.
- **101** pour les parties rapides, avec les mêmes options.
- De 1 à 8 joueurs, pour les parties en solo sans adversaire ou les parties multijoueurs, avec saisie des fléchettes, volées et historique récent.
- Interface adaptée au mobile : score et volée du joueur actif mis en avant, scores et dernières volées des autres joueurs toujours visibles en format compact. Les règles avancées sont repliées au démarrage.
- Annulation du dernier lancer (fonction disponible pendant une partie, pas un mode de jeu).
- Résumé des règles qui s'adapte au mode et aux options sélectionnés.
- Pour chaque fléchette, choisissez Simple, Double ou Triple, puis touchez une cible de 0 à 20 : le lancer est enregistré immédiatement. Le multiplicateur revient automatiquement sur Simple après chaque fléchette ; deux boutons séparés comptent le bull extérieur à 25 points et le bull intérieur à 50 points.
- Les fiches de score affichent les fléchettes de la dernière volée séparément, ainsi que leur total.
- À la fin d'une partie, génération locale d'une image PNG des scores et statistiques (ratés, dépassements, moyenne des touches, meilleures volées, volées de 100+ et doubles), partageable via le navigateur ou téléchargeable.

La moyenne est le score moyen des fléchettes non nulles. Les dépassements comptent les lancers qui font passer sous zéro ; les busts incluent également les scores restants de 1 et les fins à zéro sans double lorsque double out est activé.

## Lancer en local

Ouvrez `index.html` dans un navigateur. Aucun build ou installation n'est nécessaire.

## Déployer sur GitHub Pages

Le workflow `.github/workflows/pages.yml` publie automatiquement le site sur GitHub Pages lorsqu'un commit est poussé sur `main` ou `master`.

Dans le dépôt GitHub, choisissez **Settings → Pages → Build and deployment → Source → GitHub Actions**. Une fois le workflow terminé, GitHub affiche l'adresse du site dans cette même page.
