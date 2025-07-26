# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js web application (branded as "Live Stream Manager") that controls multiple OBS Source Switchers. It provides a UI for managing live stream sources across different screen layouts (large, left, right, topLeft, topRight, bottomLeft, bottomRight) and communicates with OBS WebSocket API to control streaming sources.

## Key Commands

### Development
- `npm run dev` - Start the development server
- `npm run build` - Build the production application
- `npm start` - Start the production server
- `npm run lint` - Run ESLint to check code quality
- `npm run type-check` - Run TypeScript type checking without emitting files

### Database Management
- `npm run create-sat-summer-2025-tables` - Create database tables with seasonal naming convention
- `npm run migrate-add-group-uuid` - Add group_uuid column to existing teams table (one-time migration)

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 15.1.6 with React 19, TypeScript, and custom CSS with glass morphism design
- **Backend**: Next.js API routes with authentication middleware
- **Database**: SQLite with sqlite3 driver
- **OBS Integration**: obs-websocket-js for WebSocket communication with OBS Studio
- **Styling**: Consolidated CSS architecture with Solarized Dark theme, CSS custom properties, Tailwind CSS utilities, and accessible glass morphism components
- **Security**: API key authentication middleware for production deployments

### Project Structure
- `/app` - Next.js App Router pages and API routes
  - `/api` - Backend API endpoints for stream management
  - `/streams` - Streams management page (add new streams and view existing)
  - `/teams` - Team management page
  - `/edit/[id]` - Individual stream editing
- `/components` - Reusable React components (Header, Footer, Dropdown, Toast, CollapsibleGroup)
- `/middleware.ts` - API authentication middleware for security
- `/lib` - Core utilities and database connection
  - `database.ts` - SQLite database initialization and connection management
  - `obsClient.js` - OBS WebSocket client with persistent connection management
  - `constants.ts` - Dynamic table naming system for seasonal deployments
  - `useToast.ts` - Toast notification system for user feedback
  - `security.ts` - Input validation and sanitization utilities
- `/types` - TypeScript type definitions
  - `Stream`, `StreamWithTeam` - Stream data types with team relationships
  - `Team` - Team data with group management fields
- `/files` - Default directory for SQLite database and text files (configurable via .env.local)
- `/scripts` - Database setup and management scripts
- `/.forgejo/workflows` - Forgejo CI/CD workflows for self-hosted runners

### Key Architectural Concepts

1. **Dynamic Table Naming System**: Uses seasonal configuration for table names (e.g., `streams_2025_summer_sat`, `teams_2025_summer_sat`) to support recurring deployments

2. **Persistent OBS Connection Management**: Single WebSocket connection shared across all API requests with automatic reconnection and connection state tracking

3. **Dual Integration Pattern**: 
   - WebSocket API for direct OBS control (source creation, status monitoring)
   - Text file system for OBS Source Switcher plugin integration (source switching)

4. **Solarized Dark Design System**: Accessible colorblind-friendly theme based on Solarized Dark palette with:
   - High contrast ratios (7.5:1+) meeting WCAG AAA standards
   - CSS custom properties for maintainable theming
   - Glass morphism effects with proper backdrop blur
   - Distinctive active navigation states for clear wayfinding

5. **Screen Position Management**: Seven distinct screen positions (large, left, right, top_left, top_right, bottom_left, bottom_right) with individual source control

6. **Real-time Status Monitoring**: Footer component polls OBS status every 30 seconds showing connection, streaming, and recording status

7. **UUID-based OBS Group Tracking**: Robust synchronization between database teams and OBS scenes using UUID identifiers to handle manual renames and ensure data consistency

8. **Toast Notification System**: User-friendly feedback system with success, error, and informational messages for all operations

9. **Stream Deletion with Confirmation**: Safe deletion workflow that removes streams from both OBS and database with user confirmation prompts

10. **OBS Scene Control**: Direct scene switching controls with dynamic state tracking and real-time synchronization between UI and OBS

11. **Studio Mode Support**: Full preview/program scene management with transition controls for professional broadcasting

12. **Collapsible Stream Groups**: Organized stream display with expandable team groups for better UI management

### Environment Configuration
- `FILE_DIRECTORY`: Directory for database and text files (default: ./files)
- `OBS_WEBSOCKET_HOST`: OBS WebSocket host (default: 127.0.0.1)
- `OBS_WEBSOCKET_PORT`: OBS WebSocket port (default: 4455)
- `OBS_WEBSOCKET_PASSWORD`: OBS WebSocket password (optional)
- `API_KEY`: Required for API authentication (set in production)

### API Endpoints

#### Stream Management
- `POST /api/addStream` - Add new stream to database and create browser source in OBS (accepts Twitch username, auto-generates URL)
- `GET /api/streams` - Get all available streams
- `GET /api/streams/[id]` - Get individual stream details
- `DELETE /api/streams/[id]` - Delete stream with comprehensive OBS cleanup:
  - Removes stream's nested scene
  - Deletes browser source
  - Removes from all source switchers
  - Clears text files referencing the stream

#### Source Control
- `POST /api/setActive` - Set active stream for specific screen position (writes team-prefixed stream name to text file)
- `GET /api/getActive` - Get currently active sources for all screens

#### Team Management
- `GET /api/teams` - Get all teams with group information
- `POST /api/teams` - Create new team
- `PUT /api/teams/[id]` - Update team name, group_name, or group_uuid
- `DELETE /api/teams/[teamId]` - Delete team with comprehensive OBS cleanup:
  - Deletes team scene/group
  - Removes team text source
  - Deletes all associated stream scenes
  - Removes all browser sources
  - Clears all text files
- `GET /api/getTeamName` - Get team name by ID
- `POST /api/createGroup` - Create OBS group from team and store UUID
- `POST /api/syncGroups` - Synchronize all teams with OBS groups
- `GET /api/verifyGroups` - Verify database groups exist in OBS with UUID tracking

#### OBS Scene Control
- `POST /api/setScene` - Switch OBS to specified scene layout (1-Screen, 2-Screen, 4-Screen)
- `GET /api/getCurrentScene` - Get currently active OBS scene for state synchronization
- `POST /api/triggerTransition` - Trigger studio mode transition from preview to program (requires studio mode enabled)

#### System Status
- `GET /api/obsStatus` - Real-time OBS connection, streaming, recording, and studio mode status

### Database Schema

Dynamic table names with seasonal configuration:
- `streams_YYYY_SEASON_SUFFIX`: id, name, obs_source_name, url, team_id
- `teams_YYYY_SEASON_SUFFIX`: team_id, team_name, group_name, group_uuid

**Database Fields**:
- `streams` table: Stores stream information with team associations
- `teams` table: Stores team information with optional OBS group mapping
  - `group_name`: Human-readable OBS scene name
  - `group_uuid`: OBS scene UUID for reliable tracking (handles renames)

### OBS Integration Pattern

The app uses a sophisticated dual integration approach:

1. **WebSocket Connection**: Direct OBS control using obs-websocket-js with persistent connection management
2. **Text File System**: Each screen position has a corresponding text file that OBS Source Switcher monitors
3. **UUID-based Group Management**: Teams mapped to OBS scenes with UUID tracking for reliable synchronization
   - Primary matching by UUID for rename-safe tracking
   - Fallback to name matching for backward compatibility
   - Automatic detection of name changes and sync issues
   - UI actions for resolving synchronization problems

**Required OBS Source Switchers** (must be created with these exact names):
- `ss_large` - Large screen source switcher
- `ss_left` - Left screen source switcher  
- `ss_right` - Right screen source switcher
- `ss_top_left` - Top left screen source switcher
- `ss_top_right` - Top right screen source switcher
- `ss_bottom_left` - Bottom left screen source switcher
- `ss_bottom_right` - Bottom right screen source switcher

See [OBS Setup Guide](./docs/OBS_SETUP.md) for detailed configuration instructions.

**Source Control Workflow**:
1. User selects stream in React UI
2. API writes source name to position-specific text file (e.g., `large.txt`, `left.txt`)
3. OBS Source Switcher detects file change and switches to specified source
4. Real-time status updates via WebSocket API

**Connection Management**: The OBS client ensures a single persistent connection across all API requests with automatic reconnection handling and connection state validation.

**Group Synchronization Workflow**:
1. Team creation optionally creates corresponding OBS scene
2. UUID stored in database for reliable tracking
3. Verification system detects sync issues (missing groups, name changes)
4. UI provides actions to fix sync problems:
   - "Clear Invalid" - Remove broken group assignments
   - "Update Name" - Sync database with OBS name changes
   - Visual indicators show sync status and UUID linking

### Component Patterns

- **Client Components**: All interactive components use `'use client'` directive for React 19 compatibility
- **Optimistic Updates**: UI updates immediately with error rollback for responsive user experience  
- **Toast Notifications**: Comprehensive feedback system with success/error messages for all operations
- **Confirmation Dialogs**: Safe deletion workflows with user confirmation prompts
- **Real-time Validation**: Client-side form validation with immediate feedback
- **Dropdown Components**: Portal-based dropdowns with proper z-index handling and scroll-aware positioning
- **Consistent Layout**: Glass morphism design with unified component styling across all pages
- **Responsive Design**: Grid layouts adapt to different screen sizes with mobile-first approach
- **Accessibility**: High contrast ratios, keyboard navigation, and screen reader support

### Security Architecture

**Authentication**: API key-based authentication protects all API endpoints through Next.js middleware
- Middleware intercepts all API requests when `API_KEY` is set
- Bypasses authentication for localhost in development
- Returns 401 for unauthorized requests

**Input Validation**: Comprehensive validation using centralized security utilities in `/lib/security.ts`:
- Screen parameter allowlisting prevents path traversal attacks
- URL validation ensures only http/https protocols
- String sanitization removes potentially dangerous characters
- Integer validation prevents injection attacks

**Path Protection**: File operations are restricted to allowlisted screen names, preventing directory traversal

**Error Handling**: Secure error responses that don't leak system information

## Key Features & Recent Enhancements

### Stream Management
- **Twitch Integration**: Simplified stream addition using just Twitch username (auto-generates full URL)
- **Enhanced Stream Deletion**: Comprehensive cleanup that removes:
  - Stream's nested scene from OBS
  - Browser source and any references
  - Entries from all source switchers
  - Text files referencing the stream
- **Audio Control**: Browser sources created with "Control Audio via OBS" enabled and auto-muted
- **Visual Feedback**: Clear "View Stream" links with proper contrast for accessibility
- **Team Association**: Streams organized under teams with proper naming conventions
- **Active Source Detection**: Properly reads current active sources from text files on page load and navigation
- **Collapsible Organization**: Streams grouped by team in expandable sections for cleaner UI
- **Enhanced Stream Display**: Shows stream status with preview/program indicators in studio mode

### Team & Group Management
- **UUID-based Tracking**: Robust OBS group synchronization using scene UUIDs
- **Enhanced Team Deletion**: Comprehensive cleanup that removes:
  - Team scene/group from OBS
  - Shared team text source
  - All associated stream scenes and sources
  - All browser sources with team prefix
- **Sync Verification**: Real-time verification of database-OBS group synchronization with system scene bypass
- **Conflict Resolution**: UI actions to resolve sync issues (missing groups, name changes)
- **Visual Indicators**: Clear status indicators for group linking and sync problems
  - 🆔 "Linked by UUID" - Group tracked by reliable UUID
  - 📝 "Name changed in OBS" - Group renamed in OBS, database needs update
  - ⚠️ "Not found in OBS" - Group in database but missing from OBS
- **System Scene Protection**: Infrastructure scenes (1-Screen, 2-Screen, 4-Screen, Starting, Ending, Audio, Movies, Resources) excluded from orphaned cleanup

### OBS Scene Control
- **Dynamic Scene Switching**: Direct control of OBS scene layouts (1-Screen, 2-Screen, 4-Screen) from the main interface
- **Real-time State Tracking**: Buttons dynamically show active/inactive states based on current OBS scene
- **Visual State Indicators**: 
  - Active buttons: Green/yellow gradient with "Active: X-Screen" text
  - Inactive buttons: Blue/cyan gradient with "Switch to X-Screen" text
- **Optimistic UI Updates**: Immediate visual feedback when switching scenes
- **Glass Morphism Integration**: Scene buttons styled consistently with existing design system
- **Toast Feedback**: Success/error notifications for scene switching operations

### User Experience Improvements
- **Toast Notifications**: Real-time feedback for all operations (success/error/info)
- **Form Validation**: Client-side validation with immediate error feedback
- **Confirmation Prompts**: Safe deletion workflows prevent accidental data loss
- **Responsive Design**: Mobile-friendly interface with glass morphism styling
- **Loading States**: Clear indicators during API operations
- **Error Recovery**: Graceful error handling with user-friendly messages
- **Enhanced Footer**: Real-time team/stream counts, OBS connection status with visual indicators
- **Optimistic Updates**: Immediate UI feedback with proper stream group name matching
- **Studio Mode Status**: Footer displays studio mode state with preview/program scene information
- **Transition Controls**: "Cut to Preview" button available when studio mode is active

### OBS Integration Improvements
- **Text Size**: Team name overlays use 96pt font for better visibility
- **Color Display**: Fixed background color display (#002b4b) using proper ABGR format
- **Standardized APIs**: All endpoints use consistent `{ success: true, data: [...] }` response format
- **Performance Optimization**: Reduced code duplication and improved API response handling
- **CSS Consolidation**: Eliminated repetitive styles, centralized theming in globals.css

### Developer Experience
- **Type Safety**: Comprehensive TypeScript definitions throughout
- **API Standardization**: Consistent response formats across all endpoints with proper error handling
- **Migration Scripts**: Database migration tools for schema updates
- **Security**: Input validation, sanitization, and secure API design
- **Performance Monitoring**: Smart polling with visibility detection and performance tracking
- **Code Optimization**: Eliminated redundancies and consolidated common patterns

## Known Issues

### Text Centering Problem
- **Issue**: Team name text overlays are not properly centered horizontally in OBS
- **Current Behavior**: Text left edge positions at center point (960px) instead of text center
- **Attempted Solutions**:
  - Various alignment properties (alignment: 5, boundsAlignment: 5)
  - Manual position calculation based on text width
  - Different bounds configurations
  - Multiple transform approaches
- **Workaround**: Manually change "Positional Alignment" to "Center" in OBS UI
- **Status**: Unresolved - requires further investigation into OBS API behavior