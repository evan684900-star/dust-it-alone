# 🧹 Dust It Alone

Un jeu de ménage incrémental, cartoon et un peu chaotique : balaie la poussière d'un vieux manoir abandonné, gagne des pièces, améliore tes outils et recrute des assistants.

👉 Le plan de conception complet est dans [`PLAN.md`](./PLAN.md).

## Jouer en local

```bash
npm install
npm run dev        # http://localhost:5173
```

Ajoute `?debug` à l'adresse pour afficher les FPS et les raccourcis de test (`G` : +1000 pièces, `C` : tout nettoyer).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | vérification TypeScript + build de production dans `dist/` |
| `npm run preview` | servir le build localement |
| `npm test` | tests unitaires (Vitest) |
| `npm run typecheck` | vérification des types |

## Déploiement

Le jeu est un site statique (Vite) déployé sur **Vercel** (configuration dans `vercel.json`).

## Stack

Vite · TypeScript · PixiJS 8 (rendu WebGL des particules) · Preact + Signals (interface)

## Avancement

- [x] **M0** : mise en place (Vite, TS, PixiJS, Preact, tests, CI, config Vercel)
- [x] **M1** : prototype « qui fait du bien » (balai, pelles, poussière, moutons, poussière d'étoile, combo, propreté, sons, effets)
- [ ] **M2** : boutique, améliorations, économie
- [ ] **M3** : pièces 1 à 3, nouveaux outils
- [ ] **M4** : assistants et gains hors-ligne
- [ ] **M5** : prestige, souvenirs, pièces 4 à 8
- [ ] **M6** : polish
- [ ] **M7** : équilibrage et lancement
