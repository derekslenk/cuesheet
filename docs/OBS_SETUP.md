# OBS Source Switcher Setup Guide

This document explains how to configure OBS Studio to work with the Source Switcher Plugin UI.

## Prerequisites

1. OBS Studio installed
2. [OBS WebSocket plugin](https://github.com/obsproject/obs-websocket) (usually included with OBS 28+)
3. [OBS Source Switcher plugin](https://obsproject.com/forum/resources/source-switcher.1090/) installed

## Required Source Switcher Names

You must create **exactly 7 Source Switcher sources** in OBS with these specific names:

| Source Switcher Name | Screen Position | Text File |
|---------------------|-----------------|-----------|
| `ss_large` | Main/Large screen | `large.txt` |
| `ss_left` | Left screen | `left.txt` |
| `ss_right` | Right screen | `right.txt` |
| `ss_top_left` | Top left corner | `topLeft.txt` |
| `ss_top_right` | Top right corner | `topRight.txt` |
| `ss_bottom_left` | Bottom left corner | `bottomLeft.txt` |
| `ss_bottom_right` | Bottom right corner | `bottomRight.txt` |

## Setup Instructions

### 1. Configure OBS WebSocket

1. In OBS, go to **Tools → WebSocket Server Settings**
2. Enable the WebSocket server
3. Set a port (default: 4455)
4. Optionally set a password
5. Note these settings for your `.env.local` file

### 2. Create Source Switcher Sources

For each screen position:

1. In OBS, click the **+** button in Sources
2. Select **Source Switcher**
3. Name it exactly as shown in the table above (e.g., `ss_large`)
4. Configure the Source Switcher:
   - **Mode**: Text File
   - **File Path**: Point to the corresponding text file in your `files` directory
   - **Switch Behavior**: Choose your preferred transition

### 3. Configure Text File Monitoring

Each Source Switcher should monitor its corresponding text file:

- `ss_large` → monitors `{FILE_DIRECTORY}/large.txt`
- `ss_left` → monitors `{FILE_DIRECTORY}/left.txt`
- etc.

Where `{FILE_DIRECTORY}` is the path configured in your `.env.local` file (default: `./files`)

### 4. Add Browser Sources

When you add streams through the UI, browser sources are automatically created in OBS with these settings:
- **Width**: 1600px
- **Height**: 900px
- **Audio**: Controlled via OBS (muted by default)

## How It Works

1. **Stream Selection**: When you select a stream for a screen position in the UI
2. **File Update**: The app writes the OBS source name to the corresponding text file
3. **Source Switch**: The Source Switcher detects the file change and switches to that source
4. **Group Organization**: Streams are organized into OBS groups based on their teams

## Troubleshooting

### Source Switcher not switching
- Verify the text file path is correct
- Check that the file is being updated (manually open the .txt file)
- Ensure Source Switcher is set to "Text File" mode

### Sources not appearing
- Check OBS WebSocket connection in the footer
- Verify WebSocket credentials in `.env.local`
- Ensure the source name doesn't already exist in OBS

### Missing screen positions
- Verify all 7 Source Switchers are created with exact names
- Check for typos in source names (they must match exactly)

## Environment Variables

Configure these in your `.env.local` file:

```env
# OBS WebSocket Settings
OBS_WEBSOCKET_HOST=127.0.0.1
OBS_WEBSOCKET_PORT=4455
OBS_WEBSOCKET_PASSWORD=your_password_here

# File Directory (where text files are stored)
FILE_DIRECTORY=./files
```