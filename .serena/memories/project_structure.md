# Project Structure

## Directory Organization

### `/app` - Next.js App Router
Main application directory using Next.js 15 App Router pattern

#### `/app/api` - Backend API Routes
- **Stream Management**
  - `addStream/` - Add new stream to database and OBS
  - `streams/` - Get all streams
  - `streams/[id]/` - Get/delete individual stream
  - `setActive/` - Set active stream for screen position
  - `getActive/` - Get currently active sources

- **Team Management**
  - `teams/` - Get all teams, create new team
  - `teams/[id]/` - Update/delete team
  - `getTeamName/` - Get team name by ID
  - `createGroup/` - Create OBS group from team
  - `syncGroups/` - Synchronize teams with OBS groups
  - `verifyGroups/` - Verify database-OBS sync

- **Scene Control**
  - `setScene/` - Switch OBS scene layout
  - `getCurrentScene/` - Get active OBS scene
  - `triggerTransition/` - Studio mode transition

- **Status**
  - `obsStatus/` - OBS connection and streaming status

#### `/app/streams` - Streams Management Page
- Main page for viewing and adding streams
- Organized by collapsible team groups

#### `/app/teams` - Team Management Page
- Create, edit, and delete teams
- Sync with OBS groups
- Verify group synchronization

#### `/app/edit/[id]` - Stream Editing Page
- Edit individual stream details
- Update team assignments

### `/components` - Reusable React Components
- `Header.tsx` - Navigation header with glass morphism
- `Footer.tsx` - Status footer with OBS monitoring
- `Dropdown.tsx` - Portal-based dropdown component
- `Toast.tsx` - Toast notification system
- `CollapsibleGroup.tsx` - Expandable stream groups

### `/lib` - Core Utilities and Services
- `database.ts` - SQLite database initialization and connection
- `obsClient.js` - OBS WebSocket client with persistent connection
- `constants.ts` - Dynamic table naming for seasonal deployments
- `useToast.ts` - Toast notification hook
- `security.ts` - Input validation and sanitization

### `/types` - TypeScript Type Definitions
- Stream types (`Stream`, `StreamWithTeam`)
- Team types (`Team`)
- OBS-related types
- API response types

### `/contexts` - React Context Providers
Context providers for shared state management

### `/scripts` - Database Management Scripts
- `createSatSummer2025Tables.ts` - Create seasonal database tables
- `addGroupUuidColumn.ts` - Migration script for group UUID

### `/files` - Runtime Data Storage (configurable)
Default location for:
- SQLite database file
- Text files for OBS Source Switcher integration
- Configurable via `FILE_DIRECTORY` environment variable

### `/public` - Static Assets
Public files served directly (images, icons, etc.)

### `/docs` - Documentation
- `OBS_SETUP.md` - OBS configuration guide
- Other project documentation

### `/.forgejo/workflows` - CI/CD Configuration
Forgejo workflows for automated testing and deployment

### `/.github` - GitHub Configuration
GitHub-specific configuration files

### `/sessions` - Session Management (cc-sessions)
Session-based task management with DAIC modes

## Key Configuration Files

### Root Level
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `.eslintrc.json` - ESLint rules
- `next.config.ts` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `jest.config.js` - Jest testing configuration
- `middleware.ts` - Next.js middleware (API authentication)
- `.env.local` - Environment variables (not in repo)
- `CLAUDE.md` - Claude Code project guidance

## Module Organization Pattern

### API Routes
Each API endpoint follows Next.js App Router convention:
```
/app/api/endpoint/route.ts
```

Routes export HTTP method handlers:
- `GET()` - Read operations
- `POST()` - Create operations
- `PUT()` - Update operations
- `DELETE()` - Delete operations

### Components
Components use named or default exports:
```typescript
// Default export
export default function ComponentName() { }

// Named export
export function ComponentName() { }
```

### Libraries
Utilities export named functions/constants:
```typescript
export const CONSTANT_NAME = value;
export function functionName() { }
```

## Import Path Aliases

- `@lib/*` → `./lib/*`
- `@/*` → `./*`

Example:
```typescript
import { getDatabase } from '@lib/database';
import { Stream } from '@/types/stream';
```
