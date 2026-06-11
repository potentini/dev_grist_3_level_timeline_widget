# Widget Grist — Timeline Gantt multi-niveau

Ce projet est un **widget pour Grist** qui affiche un planning type **Gantt** hiérarchique jusqu’à **trois niveaux** : niveau 1, niveau 2 et niveau 3. Seul le **niveau 1** est requis ; les niveaux 2 et 3 sont optionnels.

Le widget peut maintenant fonctionner de deux façons :

1. **Mapping direct multitable depuis le widget** : le bouton `Mapping` permet de choisir une table source par niveau, puis les colonnes titre, dates, statut, responsable et avancement. C’est le mode recommandé, car les lignes et colonnes à modifier sont identifiées directement.
2. **Compatibilité avec le mapping Grist classique** : une table liée/consolidée peut encore construire le Gantt et router les changements vers les vraies tables sources si elle expose les colonnes `levelNSource...`.

## Fonctionnalités principales

- Affichage Gantt hiérarchique `Niveau 1 → Niveau 2 → Niveau 3`.
- Mapping direct multitable intégré au widget : sélection d’une table source par niveau et mise à jour automatique des listes de champs disponibles.
- Prise en charge des colonnes de références multiples (`Reference List`) pour les niveaux 2 et 3 : chaque référence devient une branche du Gantt.
- Regroupement automatique des doublons hiérarchiques : un même parent n’apparaît qu’une fois et rassemble tous ses enfants associés.
- Champs essentiels par niveau : nom, date de début, date de fin, statut, responsable, avancement.
- Niveau 1 obligatoire ; niveaux 2 et 3 facultatifs.
- Zoom temporel : `jour`, `semaine`, `mois`, `année`, `tout`.
- Navigation temporelle : précédent / suivant / aujourd’hui, avec aujourd’hui placé par défaut dans le deuxième tiers de la timeline et un pas de déplacement très réduit.
- Repli / dépli global et par nœud hiérarchique.
- Coloration configurable par niveau, nom, statut, responsable, avancement, table source ou dates.
- Infobulles riches au survol : dates, niveau, statut, responsable, avancement, source.
- Édition depuis l’infobulle en respectant le type de la colonne source (texte, numérique, référence, choix, choix multiples, etc.) et affichage des choix disponibles pour les champs Choice/ChoiceList.
- Édition des dates par glisser-déposer sur les barres explicitement datées.
- Routage d’écriture vers les tables sources via `grist.docApi.applyUserActions`.
- Persistance locale de l’état UI via `localStorage`.

## Structure du projet

- `index.html` : UI du widget (layout + styles + chargement API Grist).
- `widget.js` : logique métier (mapping multi-niveau, arbre Gantt, rendu timeline, interactions, synchronisation Grist).
- `README.md` : documentation du projet.

## Mapping direct multitable recommandé

Ouvrez le panneau `Mapping`, puis configurez :

- **Niveau 1** : table racine + colonnes `Titre`, `Date début`, `Date fin`, `Statut`, `Responsable`, `Avancement`.
- **Niveau 2** : table source du deuxième niveau + colonne `Parent niveau 1` qui référence la ligne du niveau 1 + les mêmes champs métier.
- **Niveau 3** : table source du troisième niveau + colonne `Parent niveau 2` qui référence la ligne du niveau 2 + les mêmes champs métier.

Dès qu’une table est choisie dans ce panneau, le widget utilise `grist.docApi.fetchTable` pour lire les vraies tables sources. Les écritures depuis l’infobulle ou le glisser-déposer utilisent ensuite `UpdateRecord` sur la table et la ligne source connues, sans dépendre d’un double mapping via une table consolidée.

Le mapping direct est sauvegardé localement dans le navigateur sous la clé `grist_gantt_direct_multitable_mapping_v1`.

## Mapping Grist classique compatible

Si vous préférez conserver une table liée/consolidée, mappez au minimum :

- `level1Name` : nom du niveau 1.

Puis, selon vos besoins :

- `levelNName` : nom du niveau N (`N = 1, 2, 3`). Pour les niveaux 2 et 3, ce champ peut être une référence simple ou une référence multiple (`Reference List`) ; le widget crée alors un nœud pour chaque référence.
- `levelNStart` : date de début affichée.
- `levelNEnd` : date de fin affichée.
- `levelNStatus` : statut.
- `levelNResponsible` : responsable.
- `levelNProgress` : avancement (`0..1`, `0..100` ou `%`).

## Écriture vers les vraies tables sources

Pour qu’un déplacement/redimensionnement depuis le widget écrive dans la vraie table métier, exposez pour chaque niveau éditable :

- `levelNSourceTableId` : identifiant de la table source réelle.
- `levelNSourceRowId` : id de la ligne source réelle.
- `levelNStartColId` : id de la colonne date de début source.
- `levelNEndColId` : id de la colonne date de fin source.
- `levelNProgressColId` : id de la colonne avancement source.
- `levelNNameColId`, `levelNStatusColId`, `levelNResponsibleColId` : ids des colonnes source modifiables depuis l’infobulle.

Exemple généralisé :

```js
const tableHandlers = {
  Projets: { tableId: "Projets", startCol: "DateDebut", endCol: "DateFin", titleCol: "Nom" },
  Taches: { tableId: "Taches", startCol: "DateDebut", endCol: "DateFin", titleCol: "Titre" },
  Sous_taches: { tableId: "Sous_taches", startCol: "DateDebut", endCol: "DateFin", titleCol: "Titre" }
};
```

Dans le widget, cette logique devient déclarative dans les colonnes mappées : une barre sait de quelle table source elle vient, quelle ligne source modifier, et quelles colonnes source mettre à jour.

Quand un champ devient éditable dans l’infobulle, le widget lit les métadonnées des tables sources (`_grist_Tables` et `_grist_Tables_column`) pour identifier le type réel de la colonne indiquée par `levelNNameColId`, `levelNStatusColId`, `levelNResponsibleColId` ou `levelNProgressColId`. Les champs `Choice` et `ChoiceList` affichent les choix autorisés dans un sélecteur ; l’enregistrement écrit ensuite dans la colonne source idoine avec `UpdateRecord`.

Si ces colonnes source ne sont pas fournies, le widget conserve un fallback et tente d’écrire dans la table sélectionnée via le mapping Grist. Quand `level2Name` ou `level3Name` est une référence multiple, l’id de ligne de chaque référence est utilisé comme source si aucun `levelNSourceRowId` explicite n’est disponible.

## Installation / utilisation dans Grist

1. Héberger `index.html` et `widget.js` sur une URL accessible (GitHub Pages, serveur interne, etc.).
2. Dans Grist, ajouter un widget via une **URL personnalisée**.
3. Renseigner l’URL de `index.html`.
4. Mapper les colonnes Grist attendues par le widget.
5. Activer l’édition des dates avec le bouton `Dates: édition bloquée/autorisée`.
6. Déplacer ou redimensionner une barre explicitement datée.

## Détails techniques

- API Grist chargée depuis : `https://docs.getgrist.com/grist-plugin-api.js`.
- Le widget utilise un modèle de dates normalisées au jour.
- Les modes de zoom sont définis dans `ZOOMS`.
- Les niveaux sont définis dans `LEVELS`.
- Les alias de mapping classique par niveau sont centralisés dans `LEVEL_ALIASES`.
- Le mapping direct multitable est stocké sous la clé `grist_gantt_direct_multitable_mapping_v1`.
- L’état utilisateur est stocké sous la clé `grist_gantt_multilevel_state_v1`.

## Limites connues

- Une barre agrégée à partir de ses enfants sans dates propres n’est pas éditable directement : mappez les dates/source du niveau concerné pour la rendre modifiable.
- En mode mapping classique, le widget dépend de la qualité des colonnes source exposées par la table consolidée.
- En mode mapping direct, les niveaux 2 et 3 doivent disposer d’une colonne parent pointant vers le niveau supérieur pour obtenir une hiérarchie complète.
- Les performances peuvent baisser sur de très gros volumes de lignes.
- La persistance d’état étant locale au navigateur, elle n’est pas partagée entre utilisateurs.

## Licence

Ce projet est distribué sous licence **MIT**.
