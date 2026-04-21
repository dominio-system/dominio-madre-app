# Dominio Corporativo (Madre App)

Panel corporativo interno de Dominio System — **solo para uso interno del owner**.

## Stack
- Electron 41.x
- Vanilla JS + HTML + Supabase JS SDK v2
- safeStorage (Keychain macOS / DPAPI Windows) para persistencia de sesión

## Features
- Login con Supabase Auth + gate via `team_members` table
- Auto-refresh de JWT cada 55 min (sin kick al usuario)
- Persistencia encriptada local (supera restart de app)
- Retry automático en 401 con refresh silencioso
- Logout real con `sb.auth.signOut()` + clear storage
- Multi-view SPA: Command Center, Overview, Funnel, Revenue, Clients, Integrations, Users, Roles, Audit, Tickets, Docs, System Status

## Ejecutar en desarrollo
```bash
npm install
npm start          # normal
npm run dev        # con DevTools abierto
```

## Build para distribución
```bash
npm run build:mac    # .dmg para Mac (x64+arm64)
npm run build:win    # .nsis para Windows x64
```

## Arquitectura
- `main.js` — Electron main process (auth + windows + refresh timer)
- `preload.js` — bridge seguro main ↔ renderer
- `login.html` — login con validación team_members
- `dashboard-madre.html` — dashboard multi-view con sbFetch wrapper
- `assets/js/*` — módulos de vistas (users, roles, rbac, payments, etc.)

## Dependencias externas
- Supabase project: `ywlyuuddqitduqtdttgo`
- Access: solo usuarios en `team_members` con `status='active'` y `role='owner'`|`admin`

## Privacy
**No distribuir este código** — contiene referencias a la arquitectura interna del producto Dominio.
