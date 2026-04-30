# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.
Project: **Tandatanganin** — a digital signature web application.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Passport.js (Google OAuth2 + Local strategy), express-session with connect-pg-simple

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Application Features

### Authentication
- Google SSO via `/api/auth/google` (Passport Google OAuth2 strategy)
- Local login via `POST /api/auth/login` with `{ username, password }`
- Session-based auth using PostgreSQL session store (`user_sessions` table)
- Superadmin local account: `tandatangan@tandatanganin.local` / `T4nda123#`

### Roles
- **superadmin**: Full access + user management, cannot be deleted
- **admin**: Manage users, see/edit all documents
- **user**: Upload docs, request sign, approve, void — sees only their own docs
- **approver**: Read-only — sees only signed docs they were assigned to, can download

### Pages (Frontend)
- `/login` — Google SSO + local login form
- `/` — Dashboard with stats and activity feed
- `/documents` — Document list with filter/search, role-aware actions
- `/documents/upload` — PDF-only drag & drop upload page
- `/documents/:id` — Document detail with signers, audit trail, download (PDF/COC/merged)
- `/documents/:id/editor` — DocuSign-like field placement editor (full-screen, no sidebar)
- `/documents/:id/sign` — Signer page to fill signature/initial/stamp fields
- `/signatures` — Saved signature profiles CRUD
- `/signature-settings` — Template management for signature/initial/stamp (draw & save)
- `/users` — User Management CRUD (admin/superadmin only)
- `/settings` — Settings page

### Signing Workflow
1. Upload PDF → creates document in `draft` status
2. Open editor → add signers (name + email + auto-color), place Signature/Initial/Stamp fields on pages
3. "Send for Signing" → status becomes `in_progress`
4. Each signer goes to `/documents/:id/sign`, clicks their fields, draws or picks saved template
5. When all signers complete → signed PDF generated with pdf-lib, status becomes `completed`
6. Download: signed PDF only | COC only | merged (signed PDF + COC)

### Profile Dropdown (sidebar)
- Click avatar → dropdown with "Signature Settings" and "Log Out"
- "Signature Settings" → manage signature/initial/stamp templates per type, set default

## Database Schema

Tables: `users`, `documents`, `signatures`, `activity`, `user_sessions`,
        `document_signers`, `document_fields`, `signature_templates`, `document_audit_log`

### users
- id, name, email (unique), phone, company_name, division
- role: superadmin | admin | user | approver
- google_id (nullable), password_hash (nullable)
- is_active, created_at, updated_at

### documents
- id, title, description, file_name, file_path (stored in api-server/uploads/), file_size
- status: draft | pending | in_progress | signed | rejected | completed
- signer_name, signer_email (legacy), uploaded_by_id (FK to users)
- signed_at, signature_data (base64, legacy), created_at, updated_at

### document_signers
- id, document_id (FK), name, email, signer_order, status (pending/completed)
- color (hex, auto-assigned), completed_at, notified, created_at

### document_fields
- id, document_id (FK), signer_id (FK), field_type (signature/initial/stamp)
- page (0-indexed), x/y/width/height (% of page), filled_at, filled_image (base64 PNG)

### signature_templates
- id, user_id (FK), template_type (signature/initial/stamp)
- name, image_data (base64 PNG), is_default, created_at

### document_audit_log
- id, document_id (FK), actor_id/name/email/ip, event_type, details (JSONB), created_at

### signatures
- id, name, signature_data (base64), type: drawn | typed | uploaded, created_at

### activity
- id, document_id (FK), document_title, action: uploaded | signed | rejected | viewed
- signer_name, timestamp

### user_sessions
- sid, sess (json), expire — managed by connect-pg-simple

## API Endpoints

### Auth
- GET `/api/auth/me` — current user
- POST `/api/auth/login` — local login
- GET `/api/auth/google` — start Google OAuth
- GET `/api/auth/google/callback` — OAuth callback
- POST `/api/auth/logout` — logout

### Users (admin/superadmin only)
- GET `/api/users`
- GET `/api/users/me`
- POST `/api/users`
- PATCH `/api/users/:id`
- DELETE `/api/users/:id`

### Documents
- GET `/api/documents?status=&search=` — filtered by role
- POST `/api/documents`
- GET `/api/documents/:id`
- PATCH `/api/documents/:id`
- DELETE `/api/documents/:id`
- POST `/api/documents/:id/sign`

### Dashboard
- GET `/api/dashboard/summary`
- GET `/api/dashboard/recent`

### Signatures
- GET `/api/signatures`
- POST `/api/signatures`
- DELETE `/api/signatures/:id`

## Important Notes

- `lib/api-zod/src/index.ts` is overwritten by codegen — the codegen script post-processes it to only export from `./generated/api`
- Session cookies: `SameSite=lax, secure=false` (Replit proxy handles HTTPS)
- `credentials: "include"` is set in `lib/api-client-react/src/custom-fetch.ts` for all API calls
- Google OAuth callback URL: `https://{first domain in REPLIT_DOMAINS}/api/auth/google/callback`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
