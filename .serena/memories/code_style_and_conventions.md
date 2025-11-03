# Code Style and Conventions

## TypeScript Configuration

### Strict Mode
- **strict: true** - All TypeScript strict checks enabled
- **noEmit: true** - Type checking only (no compilation)
- **target: ES2017** - Modern JavaScript features

### Module System
- **module: esnext** - Modern ES modules
- **moduleResolution: bundler** - Bundler-style resolution
- **esModuleInterop: true** - CommonJS/ESM interoperability

### Path Aliases
- `@lib/*` → `./lib/*`
- `@/*` → `./*`

## ESLint Configuration

### Extends
- `next/core-web-vitals` - Next.js best practices
- `next/typescript` - TypeScript rules
- `prettier` - Code formatting consistency

### Custom Rules
- `@typescript-eslint/no-require-imports: off` - Allow require() statements

## Naming Conventions

### Files and Directories
- **Components**: PascalCase (e.g., `Header.tsx`, `CollapsibleGroup.tsx`)
- **Utilities/Libraries**: camelCase (e.g., `database.ts`, `obsClient.js`)
- **API Routes**: camelCase (e.g., `addStream/route.ts`, `setActive/route.ts`)
- **Types**: PascalCase (e.g., `Stream`, `Team`, `StreamWithTeam`)

### Variables and Functions
- **Variables**: camelCase (e.g., `streamName`, `teamId`, `currentScene`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `FILE_DIRECTORY`, `OBS_WEBSOCKET_HOST`)
- **Functions**: camelCase (e.g., `getDatabase`, `setActiveSource`, `createGroup`)
- **React Components**: PascalCase (e.g., `Header`, `Dropdown`, `Toast`)

### Database
- **Tables**: snake_case with seasonal suffix (e.g., `streams_2025_summer_sat`, `teams_2025_summer_sat`)
- **Columns**: snake_case (e.g., `team_id`, `obs_source_name`, `group_uuid`)

## Component Patterns

### Client Components
All interactive components must use `'use client'` directive for React 19 compatibility:
```typescript
'use client';

export default function ComponentName() {
  // component code
}
```

### API Response Format
Standardized response structure:
```typescript
// Success
return Response.json({ success: true, data: result });

// Error
return Response.json({ success: false, error: 'Error message' }, { status: 400 });
```

### Error Handling
- Use try-catch blocks for all async operations
- Provide user-friendly error messages
- Log detailed errors to console
- Return appropriate HTTP status codes

### State Management
- React hooks (useState, useEffect) for local state
- Custom hooks for reusable logic (e.g., `useToast`)
- Context API for shared state when needed

### Type Safety
- Define interfaces for all data structures
- Use TypeScript strict mode
- Avoid `any` type unless absolutely necessary
- Export types from `/types` directory

## Design Patterns

### Locality of Behavior
- Keep related code together
- Functions serving data structures should live with those structures
- Avoid over-abstraction

### Minimal Abstraction
- Prefer simple function calls over complex inheritance
- Function calls are cleaner than inheritance hierarchies

### Readability Over Cleverness
- Code should be obvious and easy to follow
- Consistent structure across similar files

## Security Practices

### Input Validation
- Validate all user inputs
- Sanitize strings to prevent injection
- Use allowlists for screen parameters
- Validate URLs for http/https only

### Authentication
- API key middleware for production
- Bypass authentication for localhost in development

### Path Protection
- Restrict file operations to allowlisted paths
- Prevent directory traversal attacks

## Testing Conventions

### Test Files
- Co-locate tests with source files or in `__tests__` directories
- Use `.test.ts` or `.test.tsx` suffix
- Mock external dependencies (OBS WebSocket, database)

### Test Structure
- Descriptive test names
- Arrange-Act-Assert pattern
- Clean up after tests (close connections, reset state)
