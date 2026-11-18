# 🧹 Dust It Alone — Plan de conception complet

> **Titre de travail :** *Dust It Alone*
> **Genre :** jeu incrémental de nettoyage (« cleaning idle / zone clearer ») **en 3D, à la première personne**, dans la lignée de *Leaf It Alone* et *Moonsweeper*
> **Plateforme :** navigateur, **PC en priorité** (souris + clavier), mobile ensuite — hébergé sur **Vercel**
> **Durée visée :** ~10 h (jeu complet : 8 pièces + prestige + histoire)
> **Style :** **belle 3D** (ombres douces, lumière volumétrique, occlusion ambiante, bloom), formes rondes et couleurs chaleureuses, avec une touche d'humour et de chaos (dans l'esprit de *Gamble With Your Friends*, sans reprendre ses visuels)
> **Langue :** français d'abord, anglais ensuite

---

## Sommaire

1. [Pitch](#1-pitch)
2. [Inspirations : ce qu'on garde et ce qu'on fait autrement](#2-inspirations--ce-quon-garde-et-ce-quon-fait-autrement)
3. [Les piliers du jeu](#3-les-piliers-du-jeu)
4. [Les boucles de jeu](#4-les-boucles-de-jeu)
5. [Mécaniques détaillées](#5-mécaniques-détaillées)
6. [La carte : un grand château](#6-la-carte--un-grand-château)
7. [Économie et équilibrage](#7-économie-et-équilibrage)
8. [La boutique : l'Arbre des Souvenirs](#8-la-boutique--larbre-des-souvenirs-arbre-de-compétences)
9. [Prestige : le Grand Ménage](#9-prestige--le-grand-ménage)
10. [Histoire et souvenirs](#10-histoire-et-souvenirs)
11. [Contrôles](#11-contrôles)
12. [Direction artistique](#12-direction-artistique)
13. [Audio](#13-audio)
14. [Interface (UI/UX)](#14-interface-uiux)
15. [Architecture technique](#15-architecture-technique)
16. [Performances](#16-performances)
17. [Sauvegarde et progression hors-ligne](#17-sauvegarde-et-progression-hors-ligne)
18. [Déploiement sur Vercel](#18-déploiement-sur-vercel)
19. [Tests et qualité](#19-tests-et-qualité)
20. [Accessibilité](#20-accessibilité)
21. [Feuille de route (jalons)](#21-feuille-de-route-jalons)
22. [Risques et parades](#22-risques-et-parades)
23. [Après la v1](#23-après-la-v1)
24. [Décisions prises](#24-décisions-prises)

---

## 1. Pitch

Tu incarnes **Plume**, un petit esprit du ménage qui se réveille dans un **immense château abandonné** depuis des siècles. **Vu à travers ses yeux (première personne)**, balai en main, tu explores le château en 3D, pièce après pièce, couloir après couloir, de la cave aux tours. Chaque pièce est recouverte de poussière, de toiles d'araignée, de taches et de bazar. Tu balaies, tu aspires, tu souffles… et chaque grain ramassé te rapporte de quoi améliorer tes outils, débloquer de nouvelles pièces et recruter de petits assistants qui nettoient pour toi.

Sous la poussière se cachent des **souvenirs** (photos, lettres, jouets) qui racontent peu à peu l'histoire de la famille royale qui vivait là.

**La promesse :** le plaisir hyper satisfaisant de voir une surface sale redevenir propre, des milliers de particules qui bougent sous ton curseur, et des chiffres qui montent.

---

## 2. Inspirations : ce qu'on garde et ce qu'on fait autrement

| Élément du genre | On garde | Notre touche à nous |
|---|---|---|
| Des milliers de particules à déplacer avec le curseur | ✅ C'est le cœur du plaisir | Plusieurs **types de saleté** avec des comportements différents (légère, collante, lourde, tache à frotter) |
| Ramasser = gagner de la monnaie | ✅ | Les particules doivent être **poussées dans la pelle / la bouche d'aération** au début, puis on débloque l'aspiration directe |
| Améliorations (rayon, force, valeur…) | ✅ | Arbre d'améliorations **par outil** + améliorations globales |
| Automatisation | ✅ | Des **assistants avec une personnalité** (moutons de poussière apprivoisés, robot, courant d'air) visibles à l'écran |
| Zones successives | ✅ | Les zones sont des **pièces d'un grand château**, avec une ambiance et une saleté propres à chacune |
| Prestige / reset | ✅ | Le **Grand Ménage** : la maison se re-salit au fil des saisons, on garde des **Étincelles** permanentes |
| — | — | Les **souvenirs cachés** et une petite histoire racontée en fragments |

> ⚠️ On ne reprend **aucun** nom, graphisme, son, niveau ou texte de ces jeux. On s'inspire uniquement du genre et de ses mécaniques générales. Tous les assets seront originaux.

---

## 3. Les piliers du jeu

1. **Satisfaction tactile** — chaque geste doit « faire du bien » : particules qui glissent, sons doux, petits éclats quand c'est propre.
2. **Progression lisible** — on voit toujours le prochain objectif (prochaine amélioration abordable, % de propreté de la pièce, prochaine pièce).
3. **Jouable activement ET en idle** — on peut jouer 30 secondes ou laisser tourner 1 heure, les deux sont récompensés.
4. **Cosy** — pas de stress, pas d'échec, pas de timer punitif. Ambiance chaleureuse.
5. **Léger et rapide** — se lance en moins de 2 secondes, tourne bien sur un téléphone moyen.

---

## 4. Les boucles de jeu

### Boucle de 30 secondes (micro)
> Bouger le curseur → pousser / aspirer la saleté → la voir disparaître dans la pelle → **+ pièces** (chiffres qui volent) → son satisfaisant.

### Boucle de 5 minutes (méso)
> Accumuler des pièces → acheter une amélioration (rayon, force, valeur, capacité) → nettoyer plus vite → atteindre **100 % de propreté** dans la pièce → débloquer la pièce suivante / un souvenir.

### Boucle de 1 heure et plus (macro)
> Recruter des assistants → automatiser une pièce → passer à la suivante → débloquer des outils → atteindre la limite → **Grand Ménage (prestige)** → recommencer plus fort avec des Étincelles → découvrir la suite de l'histoire.

### Durée cible
- **Première pièce terminée :** ~3 min
- **Premier assistant :** ~8 min
- **Premier prestige :** ~45–60 min
- **Fin de l'histoire (v1) :** **~10 h** de jeu actif + idle (choix validé)

---

## 5. Mécaniques détaillées

### 5.1 La saleté (les particules)

La saleté réapparaît en continu (vitesse de dépôt propre à chaque pièce) : une pièce n'est jamais vide pour toujours, ce qui alimente la boucle idle.

| Type | Apparence | Comportement | PV | Valeur de base | Débloqué |
|---|---|---|---|---|---|
| **Poussière** | petits grains gris | très légère, glisse facilement | 1 | 1 | Pièce 1 |
| **Mouton** | boule duveteuse | roule, un peu plus lourd, se scinde en 3 poussières si on le frappe fort | 3 | 5 | Pièce 1 |
| **Miettes** | grains beiges | légères, s'accumulent en tas | 1 | 2 | Pièce 2 |
| **Toile d'araignée** | filaments sur les bords | **fixe**, ne se pousse pas : il faut le **plumeau** (maintenir dessus) | 5 | 15 | Pièce 2 |
| **Tache** | auréole sur le sol | **fixe**, il faut **frotter** (mouvements de va-et-vient) avec l'éponge | 10 | 40 | Pièce 3 |
| **Feuilles mortes** | feuilles | légères, s'envolent avec le souffleur | 2 | 8 | Pièce 4 |
| **Gravats** | petits cailloux | lourds : il faut une **force** minimale pour les bouger | 8 | 30 | Pièce 5 |
| **Suie** | poudre noire | salit les particules voisines si on la laisse trop longtemps (léger malus) | 4 | 20 | Pièce 6 |
| **Poussière d'étoile** ✨ | grain doré brillant | **rare** (0,1 %), vaut beaucoup, donne des fragments d'Étincelle | 1 | ×100 | Pièce 1 |

### 5.2 Les outils

Le joueur a **un outil actif à la fois** (changement rapide par raccourci ou barre d'outils).

| Outil | Effet | Mécanique | Débloqué |
|---|---|---|---|
| **Balai** 🧹 | **Pousse** les particules dans la direction du mouvement | Rayon + force. On doit pousser la saleté vers la **pelle** (zone de collecte) | Départ |
| **Plumeau** 🪶 | Retire les toiles d'araignée | Maintenir dessus, dégâts/s | Pièce 2 |
| **Éponge** 🧽 | Retire les taches | Il faut **frotter** : la distance parcourue sur la tache fait des dégâts | Pièce 3 |
| **Aspirateur** 🌀 | **Aspire** les particules dans le rayon (collecte directe, sans pelle) | Attire vers le curseur, a un **réservoir** à vider | Pièce 3 |
| **Souffleur** 💨 | Pousse très fort en cône | Envoie la saleté vers les **bouches d'aération** | Pièce 4 |

### 5.3 La collecte

- **Pelle / bouche d'aération** : zones fixes dans chaque pièce. Toute particule qui y entre est ramassée → **+ pièces**.
- **Aspirateur** : collecte directe mais il a un **réservoir** (capacité). Plein → il faut le vider en cliquant sur la poubelle (ou automatiquement avec une amélioration). Ça crée une petite friction en début de partie, qu'on supprime ensuite par les améliorations (sensation de progression).
- **Combo** : ramasser beaucoup de particules en peu de temps remplit une jauge de combo (×1 → ×2 → ×3) qui retombe doucement. Récompense le jeu actif.

### 5.4 La propreté d'une pièce

- Chaque pièce affiche un **% de propreté** (= 1 − saleté présente / saleté max).
- À **100 % pour la première fois** : petite célébration ✨, bonus de pièces, déblocage de la pièce suivante, parfois un souvenir.
- **Étoiles de pièce** : 1★ (100 % une fois), 2★ (100 % maintenu 30 s), 3★ (100 % avec la saleté « boostée »). Chaque étoile = bonus permanent de valeur sur la pièce.

### 5.5 Les assistants (automatisation)

Visibles à l'écran, avec une IA simple (chercher la zone la plus sale, pousser vers la pelle).

| Assistant | Comportement | Débloqué |
|---|---|---|
| **Moutonnet** | Mouton de poussière apprivoisé, roule au hasard et pousse la saleté | Pièce 1 (après 1★) |
| **Plumette** | Petit plumeau volant, s'occupe des toiles d'araignée | Pièce 2 |
| **Roulio** | Petit robot aspirateur, va vers la zone la plus dense, vide son réservoir tout seul | Pièce 3 |
| **Courant d'air** | Souffle régulier dans une direction, pousse tout vers les bouches | Pièce 4 |
| **Chat du château** | Dort la plupart du temps ; quand il se réveille, il « nettoie » une grande zone en courant (bonus aléatoire) | Pièce 5 |

Chaque assistant s'améliore : vitesse, rayon, nombre, intelligence (aller où c'est le plus sale).

### 5.6 Événements aléatoires (petits pics de fun)

- **Fenêtre ouverte** : un coup de vent apporte beaucoup de feuilles → beaucoup de pièces si on réagit vite.
- **Pluie de poussière d'étoile** : 20 s pendant lesquelles les particules dorées sont 10× plus fréquentes.
- **Le chat renverse un pot** : une grosse tache apparaît, valeur ×5.
- **Pièce brillante** : un objet brillant apparaît, cliquer dessus donne un bonus temporaire (×2 valeur pendant 60 s).

---

## 6. La carte : un grand château

**Choix validé : la carte est un château entier, avec beaucoup de pièces reliées entre elles**, pour que le monde soit vraiment grand. On ne « téléporte » pas d'une pièce à l'autre : on **marche** d'une salle à la suivante par les portes, les couloirs et les escaliers, et on voit le château se dessiner autour de soi.

### Plan du château (v1 : 14 pièces sur 5 niveaux)

```
                         ┌───────────────────┐
  NIVEAU 4 (toit)        │ Chemin de ronde 🍂 │──── Tour de l'horloge ⏰
                         └─────────┬─────────┘
                         ┌─────────┴─────────┐
  NIVEAU 3 (combles)     │ Combles du donjon │  ← départ du jeu
                         └─────────┬─────────┘
            ┌──────────────┬───────┴──────┬──────────────┐
  NIVEAU 2  │ Bibliothèque │   Galerie    │ Chambre royale│
  (étage)   │      📚      │ des portraits│      👑       │
            └──────────────┴───────┬──────┴──────────────┘
            ┌──────────┬───────────┴──────────┬───────────┐
  NIVEAU 1  │ Cuisines │  GRAND HALL (énorme) │ Salle des │──── Chapelle
  (rez-de-  │   🍳     │   escalier d'honneur │ banquets  │
  chaussée) └────┬─────┴───────────┬──────────┴───────────┘
                 │          Cour intérieure 🌳 (extérieur)
            ┌────┴─────┐  ┌────────┴──┐
  NIVEAU 0  │ Caves à  │──│ Cachots ⛓️ │
  (sous-sol)│  vin 🍷  │  └───────────┘
            └──────────┘
```

| # | Pièce | Taille | Ambiance | Saletés introduites | Ouverture |
|---|---|---|---|---|---|
| 1 | **Combles du donjon** | moyenne | charpente, lucarne, cartons | Poussière, Moutons | Départ |
| 2 | **Galerie des portraits** | longue | tableaux qui « suivent du regard », tapis rouge | Toiles d'araignée | 500 |
| 3 | **Bibliothèque** | grande, 2 niveaux | étagères géantes, échelles | Miettes de papier, Suie | 6 000 |
| 4 | **Chambre royale** | moyenne | lit à baldaquin, coffres | Taches (vin renversé) | 40 000 |
| 5 | **Grand Hall** | **immense** | escalier d'honneur, lustre, armures | tout mélangé, énormément | 250 000 |
| 6 | **Salle des banquets** | grande | table de 20 m, cheminée | Miettes, Taches | 1,5 M |
| 7 | **Cuisines** | moyenne | fourneaux, chaudrons | Miettes, Graisse (tache) | 8 M |
| 8 | **Chapelle** | moyenne | vitraux colorés (lumière colorée au sol !) | Poussière d'étoile fréquente | 40 M |
| 9 | **Cour intérieure** | grande, extérieur | arbre géant, fontaine | Feuilles mortes | 200 M |
| 10 | **Caves à vin** | longue | tonneaux, voûtes, torches | Gravats, Toiles | 1 B |
| 11 | **Cachots** | moyenne | grilles, chaînes, très sombre (lanterne !) | Suie, Gravats | 6 B |
| 12 | **Tour de l'horloge** | haute, en spirale | mécanisme géant qui tourne | tout | 40 B |
| 13 | **Chemin de ronde** | très longue, extérieur | remparts, vue sur la vallée, vent | Feuilles (le vent les ramène !) | 250 B |
| 14 | **Salle du trône** (finale, secrète) | immense | trône, vitraux, lune | tout + poussière d'étoile | Tous les souvenirs |

### Règles de la carte
- **Portes verrouillées** 🔒 : chaque nouvelle pièce s'ouvre en payant son prix devant la porte (cadenas qui saute, porte qui s'ouvre en grinçant). On voit un peu la pièce suivante par le trou de la serrure / la porte entrouverte, pour donner envie.
- **Couloirs et escaliers** qui relient les pièces ; ils se salissent aussi (un peu).
- **Raccourcis** à débloquer (passages secrets derrière des tableaux, toboggan à linge vers les cuisines) pour circuler vite quand le château devient grand.
- **Carte du château** (`M`) : plan par étages, % de propreté de chaque pièce, position du joueur et des assistants.
- Chaque pièce a sa **taille**, sa **vitesse de dépôt**, ses **pelles / bouches d'aération**, ses **meubles-obstacles** et sa **lumière** propre.
- Les **assistants** sont assignés à une pièce et continuent d'y travailler quand tu es ailleurs (simulation simplifiée hors écran, voir §16).

## 7. Économie et équilibrage

### 7.1 Monnaies

| Monnaie | Gagnée par | Sert à | Persiste au prestige ? |
|---|---|---|---|
| **Pièces** 🪙 | Ramasser de la saleté | Améliorations, assistants, pièces | ❌ |
| **Étincelles** ✨ | Grand Ménage (prestige) | Arbre permanent | ✅ |
| **Souvenirs** 📜 | Trouvés sous la saleté | Album + bonus passifs | ✅ |

### 7.2 Formules (point de départ, à ajuster en playtest)

```
Coût d'une amélioration      = coûtBase × croissance ^ niveau          (croissance 1.15 à 1.6 selon l'amélioration)
Valeur d'une particule       = valeurBase × multPièce × multAmélios × multÉtincelles × combo
Vitesse de dépôt d'une pièce = dépôtBase × (1 + 0.1 × niveauAmélio "Fenêtres ouvertes")
Étincelles au prestige       = floor( (pièces totales gagnées depuis le dernier prestige / 1e6) ^ 0.5 )
Bonus d'une Étincelle        = +2 % de valeur globale par Étincelle non dépensée
```

### 7.3 Cibles d'équilibrage

- Le joueur doit pouvoir s'offrir **une amélioration toutes les 15–45 s** au début, puis toutes les 1–3 min.
- Le prochain achat doit coûter **entre 1 et 3 minutes** de gains actuels la plupart du temps.
- En idle pur, le gain doit être **~30–50 %** du gain en jeu actif (le jeu actif reste meilleur, mais l'idle n'est pas inutile).

### 7.4 Outil d'équilibrage

Un **simulateur** (script Node, `tools/simulate.ts`) qui joue une partie « bot » accélérée en utilisant les mêmes formules que le jeu et sort un tableau : temps pour chaque pièce, chaque assistant, premier prestige. Permet d'ajuster les chiffres sans tout rejouer à la main.

### 7.5 Affichage des grands nombres

`1 234` → `12,3 k` → `4,56 M` → `7,89 B` → `1,23 T` → puis `aa, ab, …` ou notation scientifique (option dans les paramètres). Les nombres restent des `number` JavaScript (jusqu'à ~1e308, largement suffisant pour la v1).

---

## 8. La boutique : l'Arbre des Souvenirs (arbre de compétences)

> Statut : **plan à valider**, pas encore codé. Les chiffres sont des points de départ, à ajuster avec le simulateur (§7.4).
> La monnaie s'appelle encore « pièces » 🪙 (peut-être bientôt « éclats de mémoire » ✨). Le plan marche pareil dans les deux cas.

### 8.1 Le principe
- **Pas de magasin classique, mais un arbre de compétences** : *l'Arbre des Souvenirs*.
- **Cohérent avec l'histoire** : chaque souvenir rendu au château fait **pousser l'arbre de Plume**. Chaque nœud est un savoir-faire oublié des anciens serviteurs du château (« l'art de balayer large », « le secret des pelles aimantées »…) que Plume retrouve en payant avec la mémoire récoltée.
- **Ouverture** avec **`B`** n'importe où (le bouton 🛒 du HUD devient 🌳 *Arbre*). On peut aussi utiliser **l'Établi de Plume**, un meuble en 3D dans les Combles avec un petit arbre sculpté qui s'illumine, et la touche `E`.
- **Le jeu continue pendant ce temps** : la poussière retombe et les assistants travaillent. La souris est libérée et le son légèrement étouffé, comme pour la carte.
- **Les portes ne sont pas dans l'arbre** : elles s'ouvrent toujours sur place avec `E`. En revanche, **ouvrir une pièce fait pousser une nouvelle branche** (voir 🏰 Château) : **l'arbre grandit avec le château**.

### 8.2 La forme de l'arbre
```
                                   🧹 BALAI
                         Brosse géante ◆   ◆ Brosse de précision     ← fourche (au choix)
                                      ╲   ╱
                    🪶 ◆─ 🧽 ◆─ 🌀 ◆   Brosse large II ●
                    (outils)    ╲      │
                     Coup de balai ●  Poils durs ●
                              ╲       │
                    Manche télesc. ● Brosse large I ●
                                  ╲   │
  👟 PLUME                          ╲ │                         🗑️ RAMASSAGE
  Pas léger ◆─ Souffle ●─ Chaussons ●─( 🌳 PLUME )─● Pelles I ─● Aspiration ─● Pelles II ─◆ Pelle aimantée
                                    ╱ │ ╲                  ╲
                                   ╱  │  ╲                  ◇ Coup de pelle  (jonction Balai + Ramassage)
              🏰 CHÂTEAU          ╱   │   ╲          ✨ MÉMOIRE
        (une branche par pièce   ╱    │    ╲   Poussière précieuse I ● ─ Combo tenace ● ─ …
         ouverte : Combles,     ●     ●     ●        … ─ Chance dorée ● ─ ◆ Combo légendaire ─ ◆ Pluie d'étoiles
         Galerie, Bibliothèque…)
                                         🐑 ASSISTANTS : « ??? » (branche cachée jusqu'au jalon M4)
```
- Au **centre**, la racine : **Plume**. **6 branches** partent tout autour en étoile : Balai (en haut), Ramassage (à droite), Mémoire (en bas à droite), Château (en bas à gauche), Plume (à gauche) et Assistants (cachée au départ).
- **Trois sortes de nœuds** :
  - **●** les **petits nœuds** : une amélioration chiffrée, de 3 à 5 niveaux (un anneau autour du nœud se remplit niveau après niveau) ;
  - **◆** les **grands nœuds** : un déblocage (nouvel outil, nouvelle mécanique). Ils coûtent cher, n'ont qu'un niveau et demandent que le nœud d'avant soit **au max** ;
  - **◇** les **jonctions** : des nœuds placés **entre deux branches**, qui demandent les deux. Ils récompensent ceux qui font grandir l'arbre de tous les côtés.
- **Règle de déblocage** : un nœud devient achetable dès que **son parent a au moins 1 niveau** (ou est au max pour un grand nœud). Certains demandent aussi une **condition de jeu**, par exemple « Ouvre la Bibliothèque ».
- **Les fourches** (1 ou 2 dans tout l'arbre, pas plus, pour rester cosy) : il faut **choisir** entre deux grands nœuds. Le choix se change **gratuitement** à tout moment depuis l'arbre, pour pouvoir expérimenter sans regret.

### 8.3 Les nœuds

Prix d'un niveau : **`prix = base × croissance^niveau`**, arrondi à 2 chiffres significatifs. Plus un nœud est **loin de la racine**, plus sa base est élevée, ce qui donne une progression naturelle du centre vers l'extérieur.

#### 🧹 Balai (en haut)
| Nœud | Type | Effet | Niv. | Base | Croiss. | Condition |
|---|---|---|---|---|---|---|
| Brosse large I | ● | +8 cm de largeur (la brosse **grandit à l'écran**) | 5 | 25 | ×1,5 | — |
| Poils durs | ● | +0,05 de prise (les moutons lourds suivent mieux) | 5 | 120 | ×1,6 | — |
| Brosse large II | ● | +10 cm de largeur | 5 | 900 | ×1,6 | — |
| Brosse géante | ◆ fourche A | +60 cm de largeur, mais −0,1 de prise | 1 | 25 000 | — | Brosse large II max |
| Brosse de précision | ◆ fourche B | +0,25 de prise, et le combo monte 20 % plus vite | 1 | 25 000 | — | Brosse large II max |
| Manche télescopique | ● | +25 cm de portée | 3 | 400 | ×2,2 | Galerie ouverte |
| Coup de balai | ● | clic maintenu : poussée de ×1,5 à ×2,5 | 5 | 600 | ×1,8 | — |
| 🪶 Plumeau | ◆ | débloque l'outil (toiles d'araignée) | 1 | 4 000 | — | Bibliothèque ouverte |
| 🧽 Éponge | ◆ | débloque l'outil (taches) | 1 | 30 000 | — | Chambre ouverte |
| 🌀 Aspirateur | ◆ | débloque l'outil (aspire directement, avec réservoir) | 1 | 150 000 | — | Grand Hall ouvert |

#### 🗑️ Ramassage (à droite)
| Nœud | Type | Effet | Niv. | Base | Croiss. | Condition |
|---|---|---|---|---|---|---|
| Pelles géantes I | ● | +15 % de taille de toutes les pelles (on les voit grossir) | 5 | 40 | ×1,55 | — |
| Aspiration magique | ● | +30 cm de rayon d'aspiration douce autour des pelles | 5 | 200 | ×1,6 | — |
| Pelles géantes II | ● | +15 % de taille | 5 | 1 500 | ×1,6 | — |
| Pelle aimantée | ◆ | les pelles attirent doucement la poussière de **toute** la pièce | 1 | 60 000 | — | Pelles géantes II max |

#### ✨ Mémoire (en bas à droite : la valeur)
| Nœud | Type | Effet | Niv. | Base | Croiss. | Condition |
|---|---|---|---|---|---|---|
| Poussière précieuse I | ● | ×1,25 sur la valeur de toute la poussière | 5 | 100 | ×1,9 | — |
| Combo tenace | ● | le combo met +0,2 s à redescendre, et redescend 10 % moins vite | 5 | 300 | ×1,7 | — |
| Poussière précieuse II | ● | ×1,3 sur la valeur | 5 | 3 000 | ×2 | — |
| Chance dorée | ● | +0,1 % de poussière d'étoile | 5 | 800 | ×1,8 | — |
| Moutons dodus | ● | les moutons valent +4 | 5 | 1 200 | ×1,7 | Galerie ouverte |
| Combo légendaire | ◆ | ajoute les paliers ×3,5 et ×4 | 1 | 40 000 | — | Combo tenace max |
| Pluie d'étoiles | ◆ | débloque l'événement « pluie de poussière d'étoile » | 1 | 120 000 | — | Chance dorée max |

#### 🏰 Château (en bas à gauche) : **une branche pousse à chaque pièce ouverte**
Chaque pièce a sa **petite branche** de 3 nœuds. Les prix sont multipliés par la valeur de la pièce : ×1 pour les Combles, ×5 pour le Grand Hall.
| Nœud | Type | Effet | Niv. | Base | Croiss. |
|---|---|---|---|---|---|
| Courants d'air | ● | +15 % de poussière qui retombe dans la pièce (= plus de revenus) | 5 | 60 × valeur | ×1,6 |
| Pelle en plus | ● | ajoute une pelle à un emplacement prévu de la pièce | 2 | 400 × valeur | ×3 |
| Écho du lieu | ◆ | le bonus « pièce impeccable » est doublé, et la pièce brille un peu | 1 | 5 000 × valeur | — |

#### 👟 Plume (à gauche)
| Nœud | Type | Effet | Niv. | Base | Croiss. | Condition |
|---|---|---|---|---|---|---|
| Chaussons de feutre | ● | +8 % de vitesse de marche et de course | 5 | 200 | ×1,9 | — |
| Souffle du vent | ● | `Maj` : course 25 % plus rapide | 3 | 3 000 | ×2,5 | Grand Hall ouvert |
| Pas léger | ◆ | tes **pieds** poussent aussi un peu la poussière en marchant | 1 | 20 000 | — | Chaussons max |

#### ◇ Jonctions (entre deux branches)
| Nœud | Entre | Effet | Prix |
|---|---|---|---|
| Coup de pelle | Balai + Ramassage | la poussière poussée **directement** dans une pelle par le balai vaut +25 % | 8 000 |
| Mémoire des lieux | Mémoire + Château | +5 % de valeur partout pour chaque pièce impeccable | 15 000 |
| Marche du balayeur | Plume + Balai | balayer en marchant vers l'avant pousse 20 % plus fort | 6 000 |

#### 🐑 Assistants (6e branche, cachée « ??? » jusqu'au jalon M4)
Moutonnet, Plumette, Roulio, Biscotte (le chat) : un nœud pour recruter chacun, puis des nœuds vitesse, rayon et intelligence.

#### ✨ L'anneau doré (prestige, plus tard)
Au **Grand Ménage** (prestige), l'arbre perd ses feuilles : tous les nœuds payés en pièces repartent à zéro. Un **anneau doré** apparaît alors **tout autour** de l'arbre, avec des nœuds payés en **Étincelles** qui restent pour toujours (voir §9). On garde **un seul arbre** pour tout, et l'arbre grandit encore à chaque saison.

### 8.4 L'écran de l'arbre
- **Plein écran**, l'arbre dessiné en **SVG**, donc net et léger, même sur ton i3.
- **Navigation** : clic-glisser pour se déplacer, molette pour zoomer, `Espace` pour recentrer sur Plume, et les flèches du clavier pour sauter de nœud en nœud.
- **États des nœuds** :
  - 🌑 verrouillé : sombre, silhouette floue ;
  - ✨ achetable : contour qui **pulse** doucement ;
  - 🟢 en cours : l'**anneau des niveaux** se remplit (3/5) ;
  - 🌼 au max : le nœud **fleurit**, avec une petite fleur dorée.
- **Les liens** entre les nœuds sont sombres au début. Ils s'**allument** quand on achète, et de petits grains de poussière dorée **remontent la sève** le long des chemins achetés.
- **Panneau de détail** au survol ou au clic : le nom, une phrase d'ambiance (« *L'art oublié de Gustave, balayeur en chef du Roi.* »), l'effet **avant → après** (« 106 cm → 114 cm »), le prix et les boutons **×1 / Max**. Un **clic maintenu** achète en rafale.
- **En haut**, le compteur de pièces et le revenu par seconde. **En bas**, une petite légende (● ◆ ◇).
- **Dans le HUD**, le bouton 🌳 affiche une pastille quand un nœud devient achetable, et une notification « *Un nouveau souvenir peut pousser !* » apparaît la première fois.

### 8.5 Sons et effets (synthétiques)
| Moment | Son | Effet visuel |
|---|---|---|
| Ouvrir / fermer l'arbre | bruissement de feuilles + glissando | l'arbre « pousse » depuis le centre en 0,5 s |
| Survol d'un nœud | « tic » dont la **note dépend de la branche** | le nœud grossit un peu |
| **Achat d'un niveau** | « ka-tching » + une **note de la gamme qui monte avec la profondeur du nœud** : l'arbre joue **une mélodie** à mesure qu'on avance | l'anneau se remplit, des pièces s'envolent vers le nœud |
| Achat en rafale | arpège qui accélère | |
| **Nœud au max** | accord doux | le nœud **fleurit** 🌼 |
| **Grand nœud** ◆ | fanfare + cloche | éclosion lumineuse, et le lien suivant s'allume avec un « whoosh » |
| Trop cher / verrouillé | « bonk » (déjà fait) | le nœud tremble, le montant manquant clignote |
| Nouvelle branche (pièce ouverte) | carillon | la branche pousse en direct dans l'arbre |

Dans le monde, les effets se voient aussi : la brosse **s'élargit en vrai** avec son empreinte au sol, et les pelles grossissent en rebondissant.

### 8.6 Rythme visé (les portes reprennent leurs vrais prix)
**Galerie 500, Bibliothèque 6 000, Chambre 40 000, Grand Hall 250 000.**
| Moment | Objectif |
|---|---|
| 0:20 | 1er nœud (Brosse large I, 25 🪙) |
| 2:00 | 5 à 8 niveaux achetés, et les 3 premières branches déjà entamées |
| 4–6 min | Galerie ouverte, la branche 🏰 Galerie pousse |
| ~15 min | Bibliothèque, et le 🪶 Plumeau en vue |
| ~35 min | Chambre royale |
| ~60 min | Grand Hall, et les premiers grands nœuds ◆ |

Règle de confort : **il y a presque toujours un nœud achetable à moins d'une minute de revenus**.

### 8.7 Comment on le code (technique)
- `src/data/tree.ts` : la liste des nœuds (`id`, branche, parent(s), type ●/◆/◇, niveaux, `base`, `growth`, condition, effet, phrase d'ambiance). La **position** de chaque nœud est calculée automatiquement : angle de la branche + distance à la racine. On n'a donc rien à placer à la main, et les branches des nouvelles pièces se rangent toutes seules.
- `src/economy/tree.ts` : `cost(node, niveau)`, `costForN` (somme géométrique), `maxAffordable`, `canBuy(node, état)` (parent, fourche, condition de jeu).
- `src/economy/modifiers.ts` : une **fonction pure** qui transforme les niveaux achetés en modificateurs pour chaque pièce (brosse, pelles, aspiration, valeur, réapparition, combo, étoiles) et pour le joueur (vitesse, portée). Elle est appliquée à chaque achat.
- **Sauvegarde** v3 : `tree: Record<nodeId, niveau>` et `forks: Record<forkId, choix>`. La migration depuis la v2 met tout à 0.
- **Interface** : `src/ui/SkillTree.tsx` (SVG, déplacement et zoom, panneau de détail).
- **Tests** : formules de prix, Max, règles de déblocage (parent, fourche, jonction, condition de pièce), modificateurs, migration, et un test du simulateur qui vérifie le rythme de §8.6.

### 8.8 Étapes
1. Données de l'arbre, formules, règles et modificateurs, avec leurs tests.
2. L'écran de l'arbre en SVG, avec les branches Balai, Ramassage, Mémoire et Plume.
3. Les effets visibles dans le monde et les sons (y compris la mélodie des achats).
4. Les branches 🏰 Château (une par pièce) et les jonctions ◇, puis les fourches.
5. L'Établi en 3D dans les Combles, puis l'équilibrage avec le simulateur et les nouveaux prix des portes.

## 9. Prestige : le Grand Ménage

- **Débloqué** quand on a ouvert le Grand Hall pour la première fois.
- **Narration :** les saisons passent, le château se re-salit, mais Plume a gagné en expérience.
- **On perd :** pièces, nœuds de l'Arbre des Souvenirs payés en pièces, assistants, pièces débloquées (sauf ce que l'anneau doré garde).
- **On garde :** Étincelles, souvenirs, étoiles de pièce, succès, statistiques.

### L'anneau doré de l'Arbre des Souvenirs (permanent, payé en Étincelles)

| Branche | Exemples de nœuds |
|---|---|
| **Main experte** | +rayon de départ, combo qui démarre à ×1,5, outils débloqués dès le départ |
| **Bonne famille** | commencer avec 1 Moutonnet, assistants 25 % plus rapides, assistants gardés au prestige |
| **Fortune** | +X % valeur globale, pièces de départ, coûts −5 % |
| **Maison accueillante** | pièces 1–3 débloquées d'office, saleté rare plus fréquente |
| **Rêveur** | gains hors-ligne prolongés (8 h → 24 h), gains hors-ligne 50 % → 100 % |

---

## 10. Histoire et souvenirs

- **~45 souvenirs** répartis dans les 14 pièces du château (3 ou 4 par pièce).
- Un souvenir est caché sous une **zone très sale** ; il apparaît quand la zone est propre (petite brillance, on clique pour le ramasser).
- Chaque souvenir = une **illustration + 1 à 3 phrases** qui racontent l'histoire de la famille (ton doux, un peu mélancolique, fin heureuse).
- **Album** : écran qui montre les souvenirs trouvés (silhouettes pour les autres).
- Compléter les 5 souvenirs d'une pièce donne un **bonus permanent** pour cette pièce.
- Compléter tout l'album ouvre la **Salle du trône** et débloque la **fin** (petite cinématique : la famille royale revient au château 🏰).

---

## 11. Contrôles

Jeu **en première personne**, pensé pour le PC (souris + clavier). La souris est capturée pendant le jeu (Pointer Lock) ; `Échap` la libère et met le jeu en pause.

| Action | Contrôle |
|---|---|
| Se déplacer | `Z Q S D` (AZERTY) ou `W A S D` (QWERTY), et les flèches. On utilise les **touches physiques**, donc les deux claviers marchent sans réglage |
| Regarder / viser | souris |
| Balayer | le balai est **au sol, là où tu regardes** (à portée de bras). Tourner la tête ou marcher balaie la poussière |
| Frotter plus fort | clic gauche maintenu |
| Courir | `Maj` |
| Changer d'outil | `1` à `5` / molette |
| Boutique | `B` |
| Carte du château | `M` |
| Pause | `Échap` |

- **Confort** : sensibilité de la souris réglable, balancement de la marche désactivable, champ de vision réglable (contre le mal des transports).
- Plus tard, pour le mobile : joystick virtuel à gauche et glisser pour regarder à droite.

## 12. Direction artistique

**Choix validé : une vraie belle 3D, vue à la première personne.** Une ambiance chaleureuse et un peu loufoque, dans l'esprit de *Gamble With Your Friends*, sans reprendre ses visuels. Tout est créé pour *Dust It Alone*.

### Rendu
- **Matériaux physiques (PBR)** : le bois est mat avec un léger relief, le laiton brille, le plastique des pelles a un vernis, et le tissu du fauteuil comme les moutons de poussière ont un reflet velouté.
- **Ombres douces en temps réel** : le soleil qui entre par la lucarne projette les ombres des meubles, de la charpente, du balai… et de chaque mouton de poussière.
- **Éclairage d'environnement** (reflets doux sur toutes les surfaces) et **lumières d'appoint** chaudes (lampe posée sur une caisse).
- **Occlusion ambiante (GTAO)** : les coins, les dessous de meubles et les tas de poussière s'assombrissent naturellement.
- **Bloom** : la lucarne, l'ampoule et la poussière d'étoile rayonnent.
- **Rayon de lumière volumétrique** et grains de poussière qui flottent dedans, **brouillard** léger pour la profondeur.
- **Tone mapping ACES** pour des couleurs riches et cinématographiques.
- Réglage **Qualité Haute / Basse** (`?quality=low`) : la version basse coupe le post-traitement pour les PC modestes.

### Formes et personnalité
- Formes **rondes et généreuses** (arêtes arrondies partout), couleurs chaudes : bois miel, moutarde, rouge tomate, vert d'eau, prune.
- Les **moutons de poussière ont des yeux et te regardent en permanence** 👀.
- Animations élastiques : la pelle rebondit quand elle reçoit de la saleté, la brosse du balai s'écrase et penche selon ton geste.
- Humour dans les textes et les menus (« La poussière t'attend. Elle est patiente. »).
- Interface (HUD) **cartoon** par-dessus la 3D : contours épais, boutons penchés, police ronde *Lilita One*.

### Pièces en 3D
- Chaque pièce est un vrai volume : les combles ont une **charpente apparente**, un toit en pente, des pignons et une lucarne ronde ; le Grand Hall a un escalier d'honneur et un lustre ; la chapelle des vitraux qui projettent des couleurs au sol.
- **Architecture de château** : murs de pierre épais, voûtes, arches, torches, tapisseries, portes en bois massif ferrées.
- Les meubles sont de **vrais obstacles** : la poussière rebondit dessus et le joueur ne les traverse pas.

## 13. Audio

- **Effets** : générés avec Web Audio (bruit blanc filtré pour le « shhh » du balai, petits « tic » pour le ramassage, accord doux pour le 100 %). Pas de fichiers lourds au début.
- **Ramassage** : son très court, avec une hauteur qui monte avec le combo (sensation de montée).
- **Limiteur de voix** : max ~8 sons simultanés, pour éviter la cacophonie quand on ramasse 500 particules d'un coup.
- **Musique** : boucles d'ambiance calmes (piano / lo-fi), une par groupe de pièces. Créées ou sous licence libre (CC0 / CC-BY avec crédits).
- **Réglages** : volume général / effets / musique, sourdine automatique quand l'onglet est caché.

---

## 14. Interface (UI/UX)

### Écran principal
```
┌──────────────────────────────────────────────────────────┐
│ 🪙 12,4 k  (+340/s)   ✨ 3      Grenier  ███████░░ 78 %  ⚙️ │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                  [ ZONE DE JEU / PIÈCE ]                 │
│                                                          │
│     (saleté, pelle, assistants, curseur de l'outil)      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [🧹][🪶][🧽][🌀][💨]   Combo ×2 ▓▓▓░   [🛒 Boutique] [🗺️] │
└──────────────────────────────────────────────────────────┘
```

### Écrans / panneaux
1. **Écran titre** (Continuer / Nouvelle partie / Paramètres)
2. **Jeu** (ci-dessus)
3. **Boutique** (panneau latéral sur desktop, tiroir du bas sur mobile) avec onglets : Outils / Global / Assistants. Les achats possibles sont mis en évidence ; achat ×1 / ×10 / Max.
4. **Carte du château** (plan par étages, pièces débloquées, % de propreté, étoiles)
5. **Arbre des Étincelles** (prestige)
6. **Album des souvenirs**
7. **Succès & statistiques**
8. **Paramètres** (audio, qualité graphique, notation des nombres, langue, accessibilité, export/import de sauvegarde, réinitialiser)
9. **Fenêtre « Pendant ton absence… »** (gains hors-ligne)

### Tutoriel
Pas de pavé de texte : des **bulles contextuelles** très courtes au bon moment.
1. « Bouge la souris pour balayer la poussière vers la pelle ! »
2. « Tu as assez de pièces : ouvre la boutique 🛒 »
3. « La pièce est propre à 100 % ! Une nouvelle porte s'ouvre… »
4. etc.

---

## 15. Architecture technique

### 15.1 Stack

| Besoin | Choix | Pourquoi |
|---|---|---|
| Build | **Vite** | ultra rapide, sortie statique parfaite pour Vercel |
| Langage | **TypeScript** (strict) | moins de bugs, autocomplétion |
| Rendu du jeu | **Three.js** (WebGL 2) | 3D complète : ombres, PBR, post-traitement (GTAO, bloom), instanciation de milliers de particules |
| Interface (menus) | **Preact** + **@preact/signals** | très léger (~4 ko), réactif, parfait pour la boutique et les panneaux |
| Styles UI | CSS modules / CSS simple avec variables | pas besoin de plus |
| Tests | **Vitest** (logique) + **Playwright** (test de fumée dans un vrai navigateur) | |
| Qualité | ESLint + Prettier | |
| PWA (optionnel) | `vite-plugin-pwa` | jouable hors connexion, installable sur téléphone |

> Pourquoi pas un moteur comme Unity ou Godot ? Three.js reste léger (aucun téléchargement de plusieurs centaines de Mo), se charge en quelques secondes dans le navigateur et se déploie tel quel sur Vercel.

### 15.2 Principes

- **Logique séparée du rendu** : la simulation (particules, économie, assistants) ne connaît pas Three.js. Elle tourne sur le **plan du sol** (2D), et le rendu la transforme en 3D. Le rendu lit l'état et l'affiche. → testable, et on peut faire tourner la simulation hors écran.
- **Boucle à pas fixe** : la logique tourne à 60 Hz fixe (accumulateur), le rendu au rythme de l'écran. Comportement identique sur un écran 60 Hz ou 144 Hz.
- **Château modulaire** : chaque pièce a sa propre simulation (coordonnées locales) et une **position dans le château** (origine, rotation, étage). Les portes relient les pièces. Seules la pièce du joueur et ses voisines sont affichées en détail ; les autres sont simulées en mode « compteurs ».
- **Données en configuration** : toutes les pièces, saletés, améliorations, assistants, souvenirs sont décrits dans des fichiers `src/data/*.ts` typés. Équilibrer = modifier des chiffres, pas du code.
- **Particules en « structure de tableaux »** : `Float32Array` pour x, y, vx, vy, `Uint8Array` pour le type, etc. Pas d'objet JS par particule → pas de ramasse-miettes qui fait ramer.
- **Grille spatiale** : le monde est découpé en cases ; pour savoir quelles particules sont sous l'outil, on ne regarde que les cases concernées.
- **Bus d'événements** léger (`particleCollected`, `roomCleaned`, `upgradeBought`…) pour brancher sons, effets, succès et tutoriel sans tout coupler.

### 15.3 Arborescence du projet

```
dust-it-alone/
├── index.html
├── package.json
├── vite.config.ts
├── vercel.json
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   └── og-image.png             # aperçu quand on partage le lien
├── src/
│   ├── main.ts                  # point d'entrée
│   ├── core/
│   │   ├── loop.ts              # boucle à pas fixe
│   │   ├── events.ts            # bus d'événements
│   │   ├── rng.ts               # aléatoire avec graine
│   │   └── format.ts            # affichage des nombres
│   ├── sim/                     # ⚙️ logique pure (aucune dépendance au rendu)
│   │   ├── particles.ts         # stockage SoA + intégration physique
│   │   ├── spatialGrid.ts
│   │   ├── tools.ts             # balai, aspirateur, souffleur, plumeau, éponge
│   │   ├── collectors.ts        # pelles, bouches d'aération
│   │   ├── spawner.ts           # dépôt de saleté
│   │   ├── helpers.ts           # IA des assistants
│   │   ├── room.ts              # état d'une pièce (propreté, étoiles)
│   │   ├── offscreen.ts         # simulation simplifiée des pièces non affichées
│   │   └── events.ts            # événements aléatoires
│   ├── economy/
│   │   ├── currencies.ts
│   │   ├── upgrades.ts          # calcul des coûts / effets
│   │   ├── prestige.ts
│   │   └── offline.ts           # gains hors-ligne
│   ├── data/                    # 📋 configuration du contenu
│   │   ├── rooms.ts
│   │   ├── dirtTypes.ts
│   │   ├── tools.ts
│   │   ├── upgrades.ts
│   │   ├── helpers.ts
│   │   ├── sparkTree.ts
│   │   ├── memories.ts
│   │   └── achievements.ts
│   ├── player/
│   │   └── player.ts            # caméra première personne, déplacements, collisions, visée du balai
│   ├── render/                  # 🎨 Three.js
│   │   ├── world3d.ts           # scène, lumières, ombres, post-traitement, particules instanciées
│   │   ├── props.ts             # meubles, pelles, balai
│   │   ├── materials.ts         # matériaux PBR
│   │   ├── geometry.ts          # formes (boîtes arrondies, moutons, étoiles)
│   │   ├── canvasTextures.ts    # textures dessinées (planches…)
│   │   └── floaters.ts          # nombres volants
│   ├── audio/
│   │   ├── synth.ts             # sons générés
│   │   └── music.ts
│   ├── ui/                      # 🧩 Preact
│   │   ├── App.tsx
│   │   ├── Hud.tsx
│   │   ├── Shop.tsx
│   │   ├── MapScreen.tsx
│   │   ├── SparkTree.tsx
│   │   ├── Album.tsx
│   │   ├── Settings.tsx
│   │   ├── OfflineModal.tsx
│   │   └── Tutorial.tsx
│   ├── save/
│   │   ├── save.ts              # sauvegarde / chargement
│   │   └── migrations.ts        # passage d'une version de sauvegarde à la suivante
│   ├── i18n/
│   │   ├── fr.ts
│   │   └── en.ts
│   └── state/
│       └── store.ts             # état global (signaux)
├── tools/
│   └── simulate.ts              # simulateur d'équilibrage
└── tests/
    ├── unit/                    # Vitest
    └── e2e/                     # Playwright
```

---

## 16. Performances

### Budgets
| Cible | Particules max | Rendu | FPS visé |
|---|---|---|---|
| **PC avec carte graphique correcte (priorité)** | 6 000 à 10 000 par pièce, toutes instanciées et avec ombres | qualité Haute (ombres 4096, GTAO, bloom, MSAA) | 60 |
| PC portable modeste | idem | qualité Basse (sans post-traitement, ombres 2048) | 60 |
| Mobile (plus tard) | 3 000 | qualité Basse | 30–60 |

- **Instanciation** : chaque type de particule = 1 seul appel de dessin, quel que soit le nombre.
- **Qualité adaptative** : si le FPS moyen tombe sous 50 pendant 3 s, on réduit le plafond de particules (et inversement). Réglage manuel Bas / Moyen / Haut / Auto.
- **Particules au repos** : une particule immobile n'est plus simulée (« endormie ») tant que rien ne la touche → énorme gain.
- **Pièces hors écran** : pas de particules individuelles, juste des **compteurs** (saleté présente par type, débit de dépôt, débit de nettoyage des assistants). Quand on revient dans la pièce, on régénère des particules à partir des compteurs.
- **Onglet caché** : on met le rendu en pause, la logique passe en mode « hors écran » (compteurs), et au retour on applique le temps écoulé.
- **Poids du jeu** : < 500 ko JS gzippé au premier chargement, assets chargés par pièce.

---

## 17. Sauvegarde et progression hors-ligne

- **Stockage** : `localStorage` (clé `dust-it-alone:save`), sauvegarde auto toutes les **15 s**, à chaque achat important et quand l'onglet se ferme (`visibilitychange` / `pagehide`).
- **Format** : JSON avec un champ `version`. Fonctions de **migration** pour ne jamais casser une ancienne sauvegarde.
- **Sécurité** : on garde aussi la **sauvegarde précédente** (rotation 2 emplacements) en cas de corruption.
- **Export / import** : chaîne de texte (JSON compressé en base64) à copier-coller, pour changer d'appareil ou faire une copie.
- **Gains hors-ligne** : à la reprise, on calcule le temps écoulé (plafonné à 8 h au début), on applique le rendement des assistants à **50 %** (améliorable), et on affiche une fenêtre « Pendant ton absence, tes assistants ont ramassé **1,2 M** 🪙 ! ».
- **Anti-triche d'horloge** : si l'heure système recule ou fait un saut absurde, on plafonne. (Jeu solo : pas besoin d'aller plus loin.)
- **Option future** : sauvegarde dans le cloud (voir §23).

---

## 18. Déploiement sur Vercel

Le jeu est un **site 100 % statique** : aucun serveur nécessaire pour la v1. C'est le cas idéal pour Vercel.

### Mise en place
1. Relier le dépôt GitHub `dust-it-alone` à un projet Vercel (import Git).
2. Vercel détecte **Vite** automatiquement :
   - Build : `npm run build`
   - Dossier de sortie : `dist`
3. Chaque push sur une branche crée un **déploiement de prévisualisation** (URL unique, pratique pour tester une version avant de la mettre en ligne).
4. Chaque merge sur `main` = **mise en production**.

### `vercel.json` (prévu)
```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```
- Les fichiers de `/assets` ont un nom avec empreinte (hash) généré par Vite → cache d'un an sans risque.
- `index.html` n'est pas mis en cache longtemps → les mises à jour arrivent tout de suite.

### Bonus Vercel (optionnels)
- **Vercel Web Analytics** : voir combien de joueurs, d'où, sur quel appareil (sans cookies).
- **Speed Insights** : surveiller la vitesse de chargement réelle.
- **Nom de domaine perso** si tu en veux un.

### Mise à jour en cours de partie
Détection d'une nouvelle version (fichier `version.json` vérifié de temps en temps) → petit bandeau « Nouvelle version disponible, recharger ? » (après sauvegarde).

---

## 19. Tests et qualité

| Type | Outil | Ce qu'on teste |
|---|---|---|
| Unitaires | Vitest | formules de coût, prestige, gains hors-ligne, format des nombres, migrations de sauvegarde, grille spatiale |
| Simulation | `tools/simulate.ts` | courbe de progression complète (aucune pièce bloquante, aucun mur) |
| Fumée (E2E) | Playwright | le jeu se charge, on peut balayer, les pièces augmentent, la boutique s'ouvre, la sauvegarde survit à un rechargement |
| Perf | Panneau de debug (`?debug`) | FPS, nb de particules, temps de simulation / rendu |
| Manuel | Playtests | sensation, lisibilité, équilibrage |

**Intégration continue (GitHub Actions)** : à chaque push → lint + typecheck + tests unitaires + build. Vercel fait ensuite le déploiement.

**Menu debug** (uniquement avec `?debug`) : donner des pièces, débloquer toutes les pièces, accélérer le temps ×10, afficher la grille spatiale.

---

## 20. Accessibilité

- **Mouvement réduit** (respecte `prefers-reduced-motion`) : moins de tremblements et d'étincelles.
- **Daltonisme** : les types de saleté se distinguent aussi par la **forme**, pas seulement la couleur.
- **Mode « une main » / sans précision** : option où le simple fait de maintenir le clic attire la saleté (pas besoin de gestes précis). Aide aussi pour les problèmes de motricité.
- **Taille de l'interface** réglable, textes lisibles, contrastes suffisants.
- **Navigation clavier** complète dans les menus.
- **Sons** désactivables séparément, sous-titres pour l'histoire (c'est du texte de toute façon).

---

## 21. Feuille de route (jalons)

Chaque jalon se termine par **une version jouable déployée sur Vercel**.

### M0 — Mise en place (½ journée)
- Projet Vite + TS + Three.js + Preact, Vitest
- `vercel.json`, premier déploiement « Hello château »
- CI GitHub Actions
- ✅ *Résultat : une URL Vercel qui affiche un écran vide avec le titre.*

### M1 — Le prototype qui fait du bien (2–3 jours) ⭐ le plus important
- Particules (poussière) en SoA + rendu 3D instancié avec ombres
- Joueur en première personne, balai au sol là où on regarde, pelles, compteur de pièces
- Dépôt continu de saleté, % de propreté
- Sons basiques, nombres volants
- ✅ *Résultat : on s'amuse 2 minutes juste à balayer. Si ce n'est pas satisfaisant ici, on ajuste avant d'aller plus loin.*

### M2 — Économie et sauvegarde (2 jours)
- Boutique (Preact) + 6–8 premières améliorations
- Système de données (`src/data`)
- Sauvegarde auto / chargement / migration
- Format des nombres, combo
- ✅ *Résultat : une vraie boucle « ramasser → acheter → plus fort ».*

### M3 — Le château et ses premières pièces (4–5 jours)
- Structure du château : pièces placées dans un même monde 3D, portes, couloirs, escaliers
- Pièces 1 à 4 (Combles, Galerie des portraits, Bibliothèque, Chambre royale), portes verrouillées, carte du château
- Moutons, miettes, toiles, taches
- Plumeau, éponge, aspirateur (+ réservoir)
- Obstacles (meubles)
- ✅ *Résultat : ~30 min de contenu.*

### M4 — Automatisation (2–3 jours)
- Assistants : Moutonnet, Plumette, Roulio
- Simulation hors écran + gains hors-ligne
- Fenêtre « Pendant ton absence… »
- ✅ *Résultat : le jeu avance tout seul quand on ne joue pas.*

### M5 — Prestige, histoire et fin de contenu (4–5 jours)
- Pièces 4 à 8, souffleur, feuilles, gravats, suie
- Courant d'air, Chat du château
- Grand Ménage + arbre des Étincelles
- Souvenirs + album + fin
- Événements aléatoires
- ✅ *Résultat : le jeu complet de bout en bout.*

### M6 — Polish (3–4 jours)
- Graphismes définitifs, atlas, animations
- Musique et sons finaux
- Tutoriel contextuel
- Mobile (tactile, tiroirs, performances, qualité adaptative)
- Succès et statistiques, paramètres complets, accessibilité
- ✅ *Résultat : un jeu qui a l'air fini.*

### M7 — Équilibrage, tests et lancement (2–3 jours)
- Simulateur d'équilibrage + ajustements
- Tests E2E, tests sur plusieurs navigateurs / téléphones
- Image de partage (Open Graph), favicon, page « crédits »
- PWA (optionnel)
- 🚀 *Lancement v1.0*

**Total estimé : ~3 à 4 semaines** de développement à temps plein (beaucoup plus rapide pour les premiers jalons jouables).

---

## 22. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Le balayage n'est pas satisfaisant | 🔴 le jeu entier tombe à plat | M1 dédié uniquement à ça, on itère jusqu'à ce que ce soit bon |
| Ralentissements (3D + ombres + post-traitement) | 🟠 | Instanciation, particules endormies, réglage de qualité, ombres et GTAO réglables |
| Mal des transports en première personne | 🟡 | Champ de vision réglable, balancement de la marche désactivable, mouvements doux |
| Économie cassée (trop lent / trop rapide) | 🟠 | Données en config + simulateur + menu debug |
| Sauvegarde perdue / corrompue | 🔴 frustration énorme | 2 emplacements, migrations testées, export manuel |
| Trop de contenu prévu | 🟡 | Les jalons M1–M4 font déjà un jeu complet ; M5+ peut être réduit (moins de pièces) |
| Ressembler trop aux jeux d'inspiration | 🟡 | Thème château/souvenirs, assets 100 % originaux, mécaniques propres (taches à frotter, réservoir, assistants avec personnalité) |

---

## 23. Après la v1

- 🏆 **Classement / statistiques partagées** via une fonction serverless Vercel + une base de données (ex. Upstash Redis depuis le Marketplace Vercel).
- ☁️ **Sauvegarde cloud** (connexion simple) pour jouer sur plusieurs appareils.
- 🎃 **Événements saisonniers** (Halloween : toiles d'araignée partout ; Noël : neige à souffler).
- 🏠 **Décoration** : utiliser les pièces pour remettre des meubles dans les pièces propres.
- 🌍 Traductions supplémentaires.
- 🎨 Skins d'outils et de curseur.

---

## 24. Décisions prises

| Question | Décision |
|---|---|
| Durée | **~10 h**, jeu complet (8 pièces, prestige, histoire) |
| Style | **Belle 3D à la première personne** (ombres, PBR, GTAO, bloom), ambiance chaleureuse et loufoque dans l'esprit de *Gamble With Your Friends* (voir §12) |
| Plateforme | **PC en priorité** (souris + clavier). Le mobile vient après le lancement PC |
| Carte | **Un grand château** de 14 pièces sur 5 niveaux, reliées par des portes, couloirs et escaliers (voir §6) |
| Thème / nom | Château + souvenirs, *Dust It Alone* (par défaut, modifiable) |
| Stack | Vite + TypeScript + **Three.js** + Preact |

### Questions encore ouvertes
1. Langues : français seul au début, ou français + anglais dès la v1 ?
2. Nom définitif du jeu ?
