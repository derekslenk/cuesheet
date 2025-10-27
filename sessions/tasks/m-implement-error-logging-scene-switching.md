---
name: m-implement-error-logging-scene-switching
branch: feature/m-implement-error-logging-scene-switching
status: pending
created: 2025-10-15
---

# Implement Error Logging for OBS Scene Switching

## Problem/Goal
Add comprehensive error logging to the OBS scene switching functionality to improve debugging and monitoring capabilities.

## Success Criteria
- [ ] Error logging added to all OBS scene switching endpoints (`/api/setScene`, `/api/getCurrentScene`, `/api/triggerTransition`)
- [ ] Errors are logged with sufficient detail including error messages, stack traces, and contextual information (scene names, operation type)
- [ ] Console logging includes timestamps and structured formatting for easier debugging
- [ ] File-logging option implemented with configurable log file path (via environment variable)
- [ ] Log files include rotation/size management to prevent excessive disk usage
- [ ] Error responses include appropriate HTTP status codes and user-friendly error messages
- [ ] Manual testing confirms errors are properly caught and logged (both console and file) when OBS connection fails or scene switching encounters issues

## Context Manifest

### How Scene Switching Currently Works: The Complete Flow

This Next.js application provides a web UI to control OBS Studio via the OBS WebSocket API. The scene switching functionality allows users to control which layout is active in OBS (1-Screen, 2-Screen, or 4-Screen). Here's how the complete flow works from user interaction to OBS response:

**Entry Points - Three Scene Switching API Routes:**

When a user clicks a scene button in the UI, the request flows through one of three API routes in `/app/api/`:

1. **`/api/setScene`** (POST) - Switches to a specific scene layout
   - Accepts a `sceneName` in the request body
   - Validates that the scene name is one of: `'1-Screen'`, `'2-Screen'`, or `'4-Screen'`
   - Checks if studio mode is enabled in OBS
   - If studio mode is active: switches the **preview** scene using `SetCurrentPreviewScene`
   - If studio mode is not active: switches the **program** scene directly using `SetCurrentProgramScene`
   - Returns success response with scene name and studio mode status

2. **`/api/getCurrentScene`** (GET) - Retrieves the current active scene
   - No request parameters needed
   - Calls OBS WebSocket `GetCurrentProgramScene` to retrieve current scene name
   - Returns the scene name in standardized response format

3. **`/api/triggerTransition`** (POST) - Transitions preview to program in studio mode
   - Checks if studio mode is enabled first
   - Returns 400 error if studio mode is not enabled
   - Calls `TriggerStudioModeTransition` to cut preview to program
   - After transition, fetches both program and preview scene names using `Promise.all`
   - Returns both scene names to update the UI

**OBS WebSocket Connection Management - The Persistent Client:**

All three endpoints use the same persistent OBS WebSocket connection managed by `/lib/obsClient.js`. This is critical for understanding error scenarios:

The `getOBSClient()` function (exported from `obsClient.js`) implements a singleton pattern with connection caching:
- **Connection State Tracking**: Maintains a module-level `obs` variable that persists across API requests
- **Connection Validation**: Checks `obs.identified` to verify the connection is active before returning
- **Race Condition Prevention**: Uses `isConnecting` flag and `connectionPromise` to prevent multiple simultaneous connection attempts
- **Automatic Reconnection**: If connection is lost, the next API call triggers a new connection via `ensureConnected()`
- **Environment Configuration**: Reads from `OBS_WEBSOCKET_HOST`, `OBS_WEBSOCKET_PORT`, and `OBS_WEBSOCKET_PASSWORD` environment variables (defaults: 127.0.0.1:4455 with no password)

**Connection Lifecycle and Event Handlers:**

The OBS WebSocket client sets up three critical event handlers that affect error scenarios:

1. `ConnectionClosed` - Sets `obs = null`, forcing reconnection on next request
2. `ConnectionError` - Logs error and sets `obs = null`
3. `Identified` - Confirms successful authentication to OBS

When `obs.connect()` is called, it attempts to connect to `ws://{host}:{port}`. If this fails (OBS not running, wrong host/port, network issues), it throws an error that propagates up through the API route.

**Current Error Handling - What Exists Today:**

The scene switching endpoints have basic error handling but it's inconsistent:

**In `/api/setScene/route.ts`:**
- Outer try/catch handles request body parsing errors (returns 400 with "Invalid request format")
- Inner try/catch around OBS operations logs `console.error('OBS WebSocket error:', obsError)`
- Returns 500 with generic message "Failed to switch scene in OBS" plus error details
- Basic validation errors return 400 with descriptive messages

**In `/api/getCurrentScene/route.ts`:**
- Single try/catch around OBS call
- Logs `console.error('OBS WebSocket error:', obsError)`
- Returns 500 with "Failed to get current scene from OBS"
- No request body validation needed (GET endpoint)

**In `/api/triggerTransition/route.ts`:**
- Outer try/catch for general errors (returns 500 "Failed to connect to OBS or trigger transition")
- Inner try/catch specifically for transition operation
- Logs `console.error('OBS WebSocket error during transition:', obsError)` and `console.error('Error triggering transition:', error)`
- Returns descriptive errors based on failure point

**Common Error Scenarios and Current Behavior:**

Based on the connection architecture, these are the failure modes that need comprehensive logging:

1. **OBS Not Running**: `getOBSClient()` fails during `obs.connect()` with connection refused error
   - Current logging: Generic console.error with error message
   - Missing context: No timestamp, no structured format, no indication which scene operation was attempted

2. **Invalid Scene Name**: OBS WebSocket rejects the `SetCurrentProgramScene` or `SetCurrentPreviewScene` call
   - Current logging: Error logged but missing which invalid scene name was attempted
   - Missing context: Stack trace often not captured

3. **Network Interruption**: Active WebSocket connection drops mid-operation
   - Current logging: Connection error event fires, logs to console
   - Missing context: No correlation between the failed API request and the connection event

4. **Studio Mode Mismatch**: Trying to trigger transition when studio mode is disabled
   - Current logging: Properly caught and returns 400 error
   - This is handled well, but could benefit from structured logging

5. **OBS API Changes**: If OBS WebSocket API changes method signatures
   - Current logging: Generic error with message
   - Missing context: The actual OBS call that failed and its parameters

**Existing Logging Utilities in Codebase:**

The codebase has a well-designed API response utility in `/lib/apiHelpers.ts` that provides structured error responses:

- `createErrorResponse(error, status, message, details)` - Creates standardized error JSON with timestamp
- `createOBSError(operation, originalError)` - Specialized helper for OBS operation errors
- Returns structured response: `{ error: string, message?: string, details?: unknown, timestamp: ISO8601 }`
- **Important**: This helper already logs to console.error with `[status]` prefix and timestamp
- Development mode includes stack traces in response, production hides them

However, **the scene switching routes do NOT currently use these helpers**. They use direct `NextResponse.json()` calls with inline error objects. This means:
- No timestamp in console logs
- Inconsistent error message format
- No structured error type classification
- No development vs production distinction in error details

**File System Patterns for Log Files:**

The application has an established pattern for file operations:

- **Configuration**: `/config.js` exports `FILE_DIRECTORY()` function that resolves to `process.env.FILE_DIRECTORY || './files'`
- **Directory Creation**: `/lib/database.ts` uses `ensureDirectoryExists()` pattern with `fs.mkdirSync(dirPath, { recursive: true })`
- **File Operations**: `/app/api/setActive/route.ts` demonstrates the pattern: `fs.writeFileSync(path.join(FILE_DIRECTORY(), '${screen}.txt'), content)`
- **Files Created**: The app already creates text files in this directory: `large.txt`, `left.txt`, `right.txt`, `top_left.txt`, etc.

This means any log file should follow the same pattern:
- Use `FILE_DIRECTORY()` from `/config.js`
- Create directory if it doesn't exist
- Use `path.join()` to construct file paths
- Log files would naturally live alongside database and text files

**Error Object Structure from obs-websocket-js:**

Looking at how errors are caught in the codebase:
- All OBS errors are caught as `obsError` and checked with `obsError instanceof Error`
- Error objects have `.message` property that contains OBS error details
- Stack traces are available on Error objects (`.stack`)
- The persistent client in `obsClient.js` logs connection errors with `.message` property

### What Needs to Be Implemented: Enhanced Error Logging

**Primary Goals:**

1. **Console Logging Improvements:**
   - Add ISO 8601 timestamps to all console.error calls
   - Include structured context: operation type, scene name, studio mode status
   - Log full stack traces for unexpected errors
   - Distinguish between expected errors (validation) and unexpected errors (OBS failures)

2. **Optional File Logging:**
   - Environment variable `LOG_FILE_PATH` to enable/configure file logging (optional, no default)
   - If enabled, write errors to log file in addition to console
   - Include same structured format as console but in persistent storage
   - Use append mode to preserve log history

3. **Log Rotation:**
   - Check log file size before writing (if file logging enabled)
   - If file exceeds configured size (e.g., 10MB via `LOG_FILE_MAX_SIZE_MB` env var), rotate it
   - Rotation: rename current log to `{filename}.old`, start fresh file
   - Simple rotation strategy (one backup file) to avoid complexity

**Integration Points:**

The implementation should integrate at these specific code locations:

1. **`/app/api/setScene/route.ts`**:
   - Line 60-68: Replace existing `console.error('OBS WebSocket error:', obsError)` with enhanced logging
   - Line 70-78: Replace `console.error('Error switching scene:', error)` with enhanced logging
   - Log context should include: `sceneName`, `studioModeEnabled` status, operation type ('SetCurrentPreviewScene' or 'SetCurrentProgramScene')

2. **`/app/api/getCurrentScene/route.ts`**:
   - Line 20-28: Replace existing error logging
   - Log context should include: operation type ('GetCurrentProgramScene')

3. **`/app/api/triggerTransition/route.ts`**:
   - Line 42-50: Replace transition-specific error logging
   - Line 52-60: Replace general error logging
   - Log context should include: studio mode check result, program/preview scene names (if available)

**Recommended Architecture Pattern:**

Create a new utility file `/lib/logger.ts` (following the pattern of `/lib/security.ts` and `/lib/apiHelpers.ts`) that exports:

```typescript
interface LogContext {
  operation: string;
  sceneName?: string;
  studioMode?: boolean;
  error: Error | unknown;
  additionalContext?: Record<string, unknown>;
}

function logError(context: LogContext): void
```

This function would:
1. Format the error with timestamp and structured data
2. Log to console.error with consistent format
3. If `LOG_FILE_PATH` env var is set, append to log file
4. Handle log rotation if file size exceeds limit
5. Safely handle any errors during logging itself (don't crash the API)

**Technical Implementation Details:**

**Environment Variables to Support:**
- `LOG_FILE_PATH` - Optional, full path to log file (e.g., `./files/obs-errors.log`)
- `LOG_FILE_MAX_SIZE_MB` - Optional, defaults to 10MB
- `LOG_LEVEL` - Optional, could be 'error' | 'warn' | 'info' for future expansion (start with just 'error')

**Log Format Recommendation:**

```
[2025-10-15T14:30:45.123Z] ERROR - OBS Scene Switching Failed
Operation: SetCurrentPreviewScene
Scene: 2-Screen
Studio Mode: true
Error: WebSocket connection failed
Stack: Error: WebSocket connection failed
    at OBSWebSocket.connect (/path/to/obs-websocket.js:123:45)
    at getOBSClient (/path/to/obsClient.js:74:11)
    ...
```

**File System Operations:**

Following the existing pattern from `/app/api/setActive/route.ts`:
- Import `fs` from 'fs' and `path` from 'path'
- Use synchronous file operations (`fs.existsSync`, `fs.statSync`, `fs.appendFileSync`, `fs.renameSync`)
- Wrap all file operations in try/catch to prevent logging errors from crashing API
- Use `path.resolve()` to handle absolute/relative paths consistently

**Log Rotation Strategy:**

```typescript
// Before appending to log file:
if (fs.existsSync(logFilePath)) {
  const stats = fs.statSync(logFilePath);
  const maxSizeBytes = (LOG_FILE_MAX_SIZE_MB || 10) * 1024 * 1024;

  if (stats.size >= maxSizeBytes) {
    // Rotate: move current to .old
    fs.renameSync(logFilePath, `${logFilePath}.old`);
  }
}

fs.appendFileSync(logFilePath, formattedLogEntry + '\n');
```

**Error Handling Within Logger:**

The logger itself must not throw errors. Pattern:

```typescript
try {
  // File logging operations
} catch (loggingError) {
  console.error('[LOGGER ERROR] Failed to write to log file:', loggingError);
  // Continue - don't let logging failure crash the API
}
```

### Existing Code Patterns to Follow

**Error Response Pattern (from `/lib/apiHelpers.ts`):**

While the logger focuses on logging, the API responses should ideally migrate to use the existing `createOBSError()` helper for consistency. However, this is not strictly required for the logging task - logging can be added independently.

**Type Safety Pattern (from `/lib/security.ts`):**

The logger should have TypeScript interfaces for all parameters and return types. Follow the pattern of type guards and validation seen in security.ts.

**Module Structure Pattern:**

All `/lib/*.ts` files follow this structure:
- Type definitions at top
- Utility functions with clear single responsibilities
- Named exports (no default exports)
- JSDoc comments for complex functions

**Import Patterns in API Routes:**

Following existing patterns in `/app/api/setScene/route.ts`:
- Next.js types: `import { NextRequest, NextResponse } from 'next/server'`
- Local utilities: `import { logError } from '@/lib/logger'`
- OBS client: `import { getOBSClient } from '@/lib/obsClient'`

### Testing Considerations

**Manual Testing Scenarios (from success criteria):**

1. **OBS Not Running**: Start app, stop OBS, try to switch scenes
   - Expected: Error logged with "connection refused" or similar
   - Verify: Console shows timestamp and context, file contains same (if enabled)

2. **Invalid Scene Name**: Modify UI to send invalid scene name
   - Expected: Error logged with validation failure
   - Verify: Logs show the invalid scene name that was rejected

3. **Studio Mode Transition Without Studio Mode**: Trigger transition with studio mode off
   - Expected: 400 error logged (this is expected behavior, not a failure)
   - Verify: Log distinguishes expected validation error from unexpected failures

4. **Network Interruption**: Connect to OBS, disconnect network, try operation
   - Expected: WebSocket error logged with full context
   - Verify: Stack trace captured in logs

5. **Log Rotation**: Generate enough errors to exceed file size limit
   - Expected: Old log renamed to .old, new log started
   - Verify: No data loss, both files readable

### File Locations for Implementation

**New File to Create:**
- `/lib/logger.ts` - Core logging utility with error logging function and log rotation logic

**Files to Modify:**
- `/app/api/setScene/route.ts` - Replace error logging at lines 60-68 and 70-78
- `/app/api/getCurrentScene/route.ts` - Replace error logging at lines 20-28
- `/app/api/triggerTransition/route.ts` - Replace error logging at lines 42-50 and 52-60

**Optional Enhancement (not required for success criteria):**
- `/lib/apiHelpers.ts` - Could extend `createOBSError()` to automatically call the new logger

**Environment Configuration:**
- Document new environment variables in project README or CLAUDE.md
- Example `.env.local` entries:
  ```
  LOG_FILE_PATH=./files/obs-errors.log
  LOG_FILE_MAX_SIZE_MB=10
  ```

### Dependencies and Libraries

**No New Dependencies Needed:**

The implementation can use only built-in Node.js modules:
- `fs` - Already used extensively (see `/app/api/setActive/route.ts`)
- `path` - Already used extensively (see `/lib/database.ts`)
- Standard JavaScript Date for timestamps (`new Date().toISOString()`)

**Why No Logging Libraries:**

Looking at `package.json`, there are no logging libraries installed (no winston, pino, bunyan, etc.). The codebase uses simple `console.log` and `console.error` throughout. Adding a heavy logging library would be inconsistent with the project's minimal dependency philosophy.

### Architecture Constraints

**Next.js API Route Execution Model:**

API routes in Next.js run in a Node.js runtime, not browser. This means:
- Synchronous file operations are acceptable (no blocking UI)
- File system is available and writable
- Environment variables are available via `process.env`

**OBS WebSocket Client Thread Safety:**

The persistent `obsClient.js` singleton can be called from multiple concurrent API requests. The logging implementation must be safe for concurrent writes:
- Use `fs.appendFileSync()` which is atomic for small writes
- Each log entry should be a single write operation
- No need for complex locking mechanisms given append semantics

**Error Budget:**

The logging implementation must be fail-safe. If logging fails (disk full, permissions error, etc.), the API route must still return an appropriate HTTP response to the user. Logging is observability, not critical path.

### Summary of Changes Required

**Console Logging Enhancement:**
- Prefix all errors with ISO timestamp
- Include structured context (operation, scene name, studio mode)
- Log full stack traces for Error objects
- Use consistent format across all three endpoints

**File Logging Addition (Optional):**
- Check `LOG_FILE_PATH` environment variable
- If set, append formatted errors to specified file
- Use same format as console logging for consistency

**Log Rotation Implementation:**
- Before each write, check file size
- If exceeds `LOG_FILE_MAX_SIZE_MB` (default 10), rotate
- Simple rotation: rename current to `.old`, start new file

**Code Changes:**
- Create `/lib/logger.ts` with `logError()` function
- Update three scene switching API routes to use new logger
- Maintain existing HTTP response behavior (only logging changes)

**Testing Requirements:**
- Manual testing with OBS offline, network issues, etc.
- Verify console output has timestamps and context
- Verify file logging works when enabled
- Verify log rotation at size threshold
- Verify API still responds correctly even if logging fails

## User Notes
<!-- Any specific notes or requirements from the developer -->

## Work Log
<!-- Updated as work progresses -->
- [YYYY-MM-DD] Started task, initial research
