# OBS Integration Details

## Dual Integration Architecture

This application uses a sophisticated **dual integration pattern** to control OBS Studio:

### 1. WebSocket API (obs-websocket-js)
**Purpose**: Direct OBS control and monitoring

**Capabilities**:
- Create browser sources
- Create and manage scenes
- Control streaming/recording
- Monitor OBS status
- Switch scenes
- Studio mode control
- Get scene information

**Connection Management**:
- Single persistent WebSocket connection shared across all API requests
- Automatic reconnection on connection loss
- Connection state validation before operations
- Configurable host, port, and password via environment variables

**Configuration**:
```
OBS_WEBSOCKET_HOST=127.0.0.1  (default)
OBS_WEBSOCKET_PORT=4455        (default)
OBS_WEBSOCKET_PASSWORD=your_password
```

### 2. Text File System (OBS Source Switcher Plugin)
**Purpose**: Real-time source switching

**How It Works**:
1. App writes stream name to position-specific text file (e.g., `large.txt`)
2. OBS Source Switcher plugin monitors these files
3. When file changes, plugin automatically switches to the specified source

**Required Source Switchers** (must exist in OBS with these exact names):
- `ss_large` - Reads from `large.txt`
- `ss_left` - Reads from `left.txt`
- `ss_right` - Reads from `right.txt`
- `ss_top_left` - Reads from `top_left.txt`
- `ss_top_right` - Reads from `top_right.txt`
- `ss_bottom_left` - Reads from `bottom_left.txt`
- `ss_bottom_right` - Reads from `bottom_right.txt`

**Text File Format**:
Each file contains a single line with the team-prefixed stream name:
```
TeamName_StreamName
```

## OBS Source Naming Convention

### Stream Sources
**Format**: `{TeamName}_{StreamName}`
- Example: `TeamA_PlayerOne`
- Created as browser sources with Twitch URLs
- Audio enabled but auto-muted
- Nested within team scenes

### Team Scenes/Groups
**Format**: `{TeamName}` or custom group name
- Stores team's stream sources
- Mapped to database via `group_uuid` (primary) or `group_name` (fallback)
- Can be renamed in OBS without breaking sync (thanks to UUID)

### System Scenes
Reserved scene names (never treated as team groups):
- `1-Screen` - Single large screen layout
- `2-Screen` - Two-screen layout
- `4-Screen` - Four-screen layout
- `Starting` - Stream start scene
- `Ending` - Stream end scene
- `Audio` - Audio-only scene
- `Movies` - Video playback scene
- `Resources` - Resource display scene

## UUID-based Group Tracking

### Why UUIDs?
- OBS scenes have immutable UUIDs that persist through renames
- Allows teams to be renamed in OBS without breaking database links
- Provides reliable synchronization between database and OBS

### Synchronization Flow
1. **Create Team**: Optionally create OBS scene, store its UUID in database
2. **Verify Sync**: Check if UUID still exists in OBS
3. **Detect Renames**: If UUID exists but name differs, flag for update
4. **Resolve Conflicts**: UI provides actions to fix sync issues

### Sync States
- **Linked by UUID** 🆔: Group tracked reliably by UUID
- **Name changed in OBS** 📝: Group renamed in OBS, database needs update
- **Not found in OBS** ⚠️: Group in database but missing from OBS
- **Orphaned in OBS**: Group in OBS but not in database (can be adopted)

## OBS WebSocket Client (`lib/obsClient.js`)

### Key Functions
- `connect()` - Establish WebSocket connection
- `disconnect()` - Close connection
- `isConnected()` - Check connection status
- `getObs()` - Get OBS client instance
- `ensureConnection()` - Ensure connection before operations

### Connection Lifecycle
- Singleton pattern ensures one connection across all API routes
- Automatic reconnection with exponential backoff
- Event handlers for connection state changes
- Graceful error handling

### Error Handling
- Connection failures logged and reported
- Operations fail gracefully if OBS unavailable
- User-friendly error messages in API responses

## Screen Position Management

### Seven Screen Positions
1. **large** - Main/center screen
2. **left** - Left side screen
3. **right** - Right side screen
4. **top_left** - Top-left quadrant
5. **top_right** - Top-right quadrant
6. **bottom_left** - Bottom-left quadrant
7. **bottom_right** - Bottom-right quadrant

### Position-Specific Operations
Each position has:
- Dedicated text file for Source Switcher
- Independent source control
- OBS source switcher instance

## Scene Layouts

### Available Layouts
- **1-Screen**: Single large screen (full broadcast view)
- **2-Screen**: Left and right screens
- **4-Screen**: Four quadrant layout

### Scene Switching
- Direct API control via `/api/setScene`
- Real-time state tracking
- Visual feedback in UI
- Toast notifications for success/error

## Studio Mode Support

### Features
- Preview/Program scene management
- Transition controls ("Cut to Preview")
- Real-time status display in footer
- Scene state synchronization

### Transition Workflow
1. Set preview scene
2. User clicks "Cut to Preview"
3. API calls `TriggerStudioModeTransition()`
4. Preview becomes program scene

## Real-time Status Monitoring

### Status Checks
Footer polls `/api/obsStatus` every 30 seconds:
- Connection status (Connected/Disconnected)
- Streaming status (Live/Offline)
- Recording status (Recording/Not Recording)
- Studio mode (Enabled/Disabled)
- Current scene
- Preview scene (if studio mode)

### Performance Optimization
- Polling pauses when page not visible
- Smart visibility detection
- Minimal network overhead

## Stream Creation Workflow

1. User enters Twitch username
2. App generates browser source URL
3. Creates nested scene for stream
4. Adds browser source to scene
5. Stores stream in database
6. Associates with team

## Stream Deletion Workflow

1. User confirms deletion
2. Delete stream's nested scene
3. Remove browser source
4. Clear from all source switchers
5. Delete from all text files
6. Remove from database

## Team Deletion Workflow

1. User confirms deletion
2. Delete team scene/group
3. Remove team text source
4. Delete all stream scenes
5. Remove all browser sources
6. Clear all text files
7. Remove from database

## Known Issues

### Text Centering Problem
- **Issue**: Team name text overlays not properly centered in OBS
- **Behavior**: Text left edge positions at center point instead of text center
- **Workaround**: Manually set "Positional Alignment" to "Center" in OBS
- **Status**: Unresolved - requires further OBS API investigation

## Security Considerations

### Input Validation
- Screen positions validated against allowlist
- Stream names sanitized
- File paths restricted to safe directories

### Authentication
- API key required for production deployments
- Localhost bypasses authentication in development

### Error Messages
- Sanitized to avoid leaking system information
- User-friendly without exposing internals
