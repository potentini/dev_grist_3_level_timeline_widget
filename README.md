# Widget Grist — Timeline Gantt multi-niveau

Ce projet est un **widget pour Grist** qui affiche un planning type **Gantt** hiérarchique jusqu’à **trois niveaux** : niveau 1, niveau 2 et niveau 3. Seul le **niveau 1** est requis ; les niveaux 2 et 3 sont optionnels.

Le widget fonctionne désormais avec son **mapping interne multitable** : le bouton `Mapping` permet de choisir une table source par niveau, puis les colonnes titre, dates, statut, responsable et avancement. Les lignes et colonnes à modifier sont ainsi identifiées directement, sans mapping natif Grist.

## Fonctionnalités principales

- Affichage Gantt hiérarchique `Niveau 1 → Niveau 2 → Niveau 3`.
- Vue table hiérarchique alternative, visuellement cohérente avec la timeline, avec champs en colonnes, édition directe des cellules sans infobulle, et sélecteur `Trier par` pour ordonner la hiérarchie selon `DateDebut1`, `DateFin1`, `DateDebut2`, `DateFin2`, `DateDebut3` ou `DateFin3`.
- Avec une vue liée Grist, le widget conserve le contexte hiérarchique : élément sélectionné, parent associé le cas échéant, tous les enfants visibles dans le mapping, et sélectionne le plus haut nœud pertinent pour alimenter les filtres des vues liées.
- Mapping interne multitable intégré au widget : sélection d’une table source par niveau et mise à jour automatique des listes de champs disponibles.
- Champs essentiels par niveau : nom, date de début, date de fin, statut, responsable, avancement.
- Niveau 1 obligatoire ; niveaux 2 et 3 facultatifs.
- Zoom temporel : `jour`, `semaine`, `mois`, `année`, `tout`.
- Navigation temporelle : précédent / suivant / aujourd’hui, avec aujourd’hui placé par défaut dans le deuxième tiers de la timeline et un pas de déplacement très réduit.
- Repli / dépli global et par nœud hiérarchique.
- Coloration configurable par niveau, nom, statut, responsable, avancement, table source ou dates.
- Infobulles compactes au survol dans la timeline : champs essentiels sans détail de type de colonne ni liste de choix.
- Ajout depuis la vue table : bouton global pour créer un niveau 1, boutons `+` sur les lignes de niveau 1 pour créer un niveau 2 rattaché, et boutons `+` sur les lignes de niveau 2 pour créer un niveau 3 rattaché.
- Bouton global `Édition bloquée/autorisée` : quand il est activé, l’édition des dates par glisser-déposer et l’édition depuis l’infobulle sont autorisées ; quand il est désactivé, aucune édition n’est possible.
- Routage d’écriture vers les tables sources via `grist.docApi.applyUserActions`.
- Persistance locale de l’état UI via `localStorage`, dont la vue active `Timeline` ou `Table`.

## Structure du projet

- `index.html` : UI du widget (layout + styles + chargement API Grist).
- `widget.js` : logique métier (mapping interne multi-niveau, arbre Gantt, rendu timeline, interactions, synchronisation Grist).
- `README.md` : documentation du projet.

## Mapping interne multitable

Ouvrez le panneau `Mapping`, puis configurez :

- **Niveau 1** : table racine + colonnes `Titre`, `Date début`, `Date fin`, `Statut`, `Responsable`, `Avancement`.
- **Niveau 2** : table source du deuxième niveau + colonne `Parent niveau 1` qui référence la ligne du niveau 1 + les mêmes champs métier.
- **Niveau 3** : table source du troisième niveau + colonne `Parent niveau 2` qui référence la ligne du niveau 2 + les mêmes champs métier.

Dès qu’une table est choisie dans ce panneau, le widget utilise `grist.docApi.fetchTable` pour lire les vraies tables sources. Les écritures depuis l’infobulle ou le glisser-déposer utilisent ensuite `UpdateRecord` sur la table et la ligne source connues.

Le mapping interne est sauvegardé localement dans le navigateur sous la clé `grist_gantt_direct_multitable_mapping_v1`.

## Écriture vers les tables sources

Pour qu’un champ soit modifiable, le mapping interne doit pointer vers une colonne source non-formule dans la table source du niveau concerné :

- dates : colonnes `Date début` et `Date fin` ;
- infobulle : colonnes `Titre`, `Statut`, `Responsable` et `Avancement`.

Quand un champ devient éditable dans l’infobulle, le widget lit les métadonnées des tables sources (`_grist_Tables` et `_grist_Tables_column`) pour identifier le type réel de la colonne configurée. Les champs `Choice`, `ChoiceList`, `Ref` et `RefList` affichent les options adaptées ; l’enregistrement écrit ensuite dans la colonne source avec `UpdateRecord`.

## Installation / utilisation dans Grist

1. Héberger `index.html` et `widget.js` sur une URL accessible (GitHub Pages, serveur interne, etc.).
2. Dans Grist, ajouter un widget via une **URL personnalisée**.
3. Renseigner l’URL de `index.html`.
4. Ouvrir le panneau `Mapping` du widget et sélectionner les tables/colonnes sources.
5. Activer l’édition avec le bouton `Édition bloquée/autorisée`.
6. Modifier un champ depuis l’infobulle, déplacer/redimensionner une barre explicitement datée ou basculer en vue `Table` pour modifier directement les cellules.
7. En vue `Table`, utiliser `+ Ajouter un niveau 1` ou les boutons `+ Niveau 2` / `+ Niveau 3` des lignes parentes pour créer des éléments rattachés dans les tables sources.

## Détails techniques

- API Grist chargée depuis : `https://docs.getgrist.com/grist-plugin-api.js`.
- Le widget utilise un modèle de dates normalisées au jour.
- Les modes de zoom sont définis dans `ZOOMS`.
- Les niveaux sont définis dans `LEVELS`.
- Le mapping interne multitable est stocké sous la clé `grist_gantt_direct_multitable_mapping_v1`.
- L’état utilisateur est stocké sous la clé `grist_gantt_multilevel_state_v1`.

## Limites connues

- Une barre agrégée à partir de ses enfants sans dates propres n’est pas éditable directement : configurez les dates source du niveau concerné pour la rendre modifiable.
- Les niveaux 2 et 3 doivent disposer d’une colonne parent pointant vers le niveau supérieur pour obtenir une hiérarchie complète.
- Les performances peuvent baisser sur de très gros volumes de lignes.
- La persistance d’état étant locale au navigateur, elle n’est pas partagée entre utilisateurs.

## Licence

Ce projet est distribué sous licence **MIT**.
