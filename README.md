# 🧹 Dust It Alone

Un jeu de ménage incrémental en 3D à la première personne : balaie la poussière d'un immense château abandonné, gagne des pièces, améliore tes outils et recrute des assistants.

👉 Le plan de conception complet est dans [`PLAN.md`](./PLAN.md).

## Jouer en local

```bash
npm install
npm run dev        # http://localhost:5173
```

Ajoute `?debug` à l'adresse pour afficher les FPS et les raccourcis de test (`G` : +1000 pièces, `C` : tout nettoyer), et `?quality=low` pour désactiver le post-traitement.

Contrôles : `ZQSD`/`WASD` pour se déplacer, la souris pour viser, clic maintenu pour balayer, `1`…`5` pour changer d'outil, `Maj` pour courir, `E` pour ouvrir une porte / utiliser l'établi, `B` l'Arbre des Souvenirs, `M` la carte, `J` l'album, `K` le carnet, `Échap` la pause.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | vérification TypeScript + build de production dans `dist/` |
| `npm run preview` | servir le build localement |
| `npm test` | tests unitaires (Vitest) |
| `npm run e2e` | tests de bout en bout dans un vrai navigateur (Playwright) |
| `npm run typecheck` | vérification des types |

## Déploiement

Le jeu est un site statique (Vite) déployé sur **Vercel** (configuration dans `vercel.json`).

## Stack

Vite · TypeScript · Three.js (3D : ombres, PBR, GTAO, bloom) · Preact + Signals (interface)

## Avancement

- [x] **M0** : mise en place (Vite, TS, Three.js, Preact, tests, config Vercel)
- [x] **Qualité graphique** : Auto + 5 niveaux, optimisé pour les puces intégrées
- [x] **M1** : prototype 3D en première personne (balai à hitbox rectangulaire, pelles, 9 types de saleté)
- [x] **M2** : l'Arbre des Souvenirs (arbre de compétences géant, fourches, remboursement)
- [x] **M3** : le château — 14 pièces sur 5 niveaux, escaliers, portes, carte ; 5 outils (balai, plumeau, éponge, aspirateur, souffleur)
- [x] **M4** : assistants (Moutonnet, Plumette, Roulio, Biscotte) et gains hors-ligne
- [x] **M5** : Grand Ménage (prestige, anneau doré), histoire complète (souvenirs, échos du passé, album, fin)
- [x] **M6** : événements aléatoires, réglages complets, export/import, carnet (stats + succès), bulles d'aide, établi 3D
- [x] **M7** : équilibrage (~19 h pour finir, simulé), image de partage, crédits, tests de bout en bout
- [ ] **Musique** : faite à part 🎵
