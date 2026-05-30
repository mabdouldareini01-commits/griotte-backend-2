# GRIOTTE — Backend NestJS

> API REST de la marketplace africaine de littérature numérique.  
> **10 FCFA / page lue · 60% auteur · 40% GRIOTTE**

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | NestJS 10 + TypeScript |
| ORM | Prisma 5 |
| Base de données | PostgreSQL 15 |
| Authentification | JWT (15min) + Refresh Token (7j) + Google OAuth2 |
| Stockage fichiers | Cloudflare R2 (S3-compatible) |
| Paiements | FedaPay (principal) + Flutterwave (secondaire) |
| Validation | class-validator + class-transformer |
| Documentation | Swagger / OpenAPI |
| Rate limiting | @nestjs/throttler (100 req/min) |

---

## Architecture des modules

```
src/
├── auth/               # JWT, Google OAuth, refresh tokens
├── users/              # Gestion des comptes
├── books/              # Catalogue, CRUD, workflow publication
├── chapters/           # Upload PDF/DOCX, extraction texte
├── reading/            # Sessions de lecture + facturation
├── wallets/            # Portefeuille, recharges FedaPay
├── transactions/       # Historique des mouvements
├── withdrawals/        # Retraits auteur Mobile Money/banque
├── notifications/      # Notifications in-app
└── prisma/             # Service Prisma partagé

prisma/
└── schema.prisma       # Schéma complet BDD
```

---

## Modèle économique — Implémentation

```typescript
const PRICE_PER_PAGE  = 10;    // FCFA
const AUTHOR_SHARE    = 0.60;  // 60% → 6 FCFA/page
const PLATFORM_SHARE  = 0.40;  // 40% → 4 FCFA/page
```

Lorsqu'un lecteur ferme une session (`POST /reading/:id/end`),
une **transaction atomique** Prisma effectue simultanément :

1. Débit du portefeuille lecteur
2. Crédit du portefeuille auteur (60%)
3. Enregistrement de la commission GRIOTTE (40%)
4. Mise à jour des stats du roman
5. Envoi d'une notification à l'auteur

---

## Installation

```bash
# 1. Cloner et installer
git clone https://github.com/votre-org/griotte-backend
cd griotte-backend
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Remplir les variables dans .env

# 3. Base de données
npx prisma migrate dev --name init
npx prisma generate

# 4. Démarrer
npm run start:dev
```

---

## Endpoints principaux

### Authentification
```
POST   /api/v1/auth/register          Inscription
POST   /api/v1/auth/login             Connexion
GET    /api/v1/auth/google            OAuth Google
POST   /api/v1/auth/refresh           Refresh JWT
POST   /api/v1/auth/logout            Déconnexion
GET    /api/v1/auth/me                Profil connecté
```

### Romans
```
GET    /api/v1/books                  Catalogue (filtres, recherche)
GET    /api/v1/books/:id              Fiche roman
POST   /api/v1/books                  Créer un roman [AUTHOR]
PUT    /api/v1/books/:id              Modifier [AUTHOR]
POST   /api/v1/books/:id/submit       Soumettre validation [AUTHOR]
POST   /api/v1/books/:id/approve      Publier [ADMIN]
POST   /api/v1/books/:id/reject       Rejeter [ADMIN]
GET    /api/v1/books/mine             Mes romans [AUTHOR]
GET    /api/v1/books/mine/stats       Stats auteur [AUTHOR]
```

### Chapitres
```
POST   /api/v1/books/:id/chapters     Upload chapitre (multipart) [AUTHOR]
GET    /api/v1/chapters/:id/content   Contenu chapitre [AUTH]
PUT    /api/v1/chapters/:id           Modifier chapitre [AUTHOR]
DELETE /api/v1/chapters/:id           Supprimer [AUTHOR]
```

### Lecture (Cœur du modèle)
```
POST   /api/v1/reading/start          Démarrer session
POST   /api/v1/reading/:id/end        Terminer session → FACTURATION
GET    /api/v1/reading/history        Historique lectures
GET    /api/v1/reading/progress/:id   Progression dans un roman
```

### Portefeuille
```
GET    /api/v1/wallets/balance        Solde actuel
POST   /api/v1/wallets/recharge       Initier paiement FedaPay
POST   /api/v1/wallets/webhook/fedapay  Webhook FedaPay confirmation
GET    /api/v1/wallets/history        Historique transactions
```

### Retraits
```
POST   /api/v1/withdrawals            Demande de retrait [AUTHOR]
GET    /api/v1/withdrawals/mine       Mes retraits [AUTHOR]
GET    /api/v1/withdrawals            Tous les retraits [ADMIN]
POST   /api/v1/withdrawals/:id/process  Traiter [ADMIN]
POST   /api/v1/withdrawals/:id/fail     Marquer échoué [ADMIN]
```

### Notifications
```
GET    /api/v1/notifications          Mes notifications
POST   /api/v1/notifications/:id/read  Marquer lu
POST   /api/v1/notifications/read-all  Tout marquer lu
GET    /api/v1/notifications/unread-count  Compteur
```

---

## Déploiement recommandé

```
Frontend (Next.js)  →  Vercel
Backend (NestJS)    →  Railway ou Render
Base de données     →  Railway PostgreSQL ou Supabase
Fichiers            →  Cloudflare R2
```

---

## Documentation interactive

Une fois démarré : `http://localhost:4000/api/docs`

---

## Structure de la base de données

```
users           → comptes lecteurs, auteurs, admins
wallets         → portefeuille FCFA par utilisateur
books           → romans avec statut de publication
chapters        → chapitres liés aux romans
reading_sessions→ sessions de lecture (début → fin)
transactions    → tous les mouvements financiers
withdrawals     → demandes de retrait auteur
bookmarks       → signets des lecteurs
reviews         → avis et notes
notifications   → notifications in-app
referrals       → programme de parrainage
refresh_tokens  → tokens JWT de rafraîchissement
```
