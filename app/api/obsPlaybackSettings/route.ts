import { NextResponse } from 'next/server';
import { applyPlaybackSettingsToInputs } from '../../../lib/obsClient';

// Re-apply the current playback policy (driven by OBS_RESTART_ON_ACTIVATE, plus
// close_when_inactive:false / clear_on_media_end:false) to every EXISTING
// ffmpeg_source in OBS. Lets a Studio-Mode config change take effect on sources
// that were already added, without deleting and re-creating the streams.
export async function POST() {
  try {
    const result = await applyPlaybackSettingsToInputs();
    return NextResponse.json({
      success: true,
      message:
        result.updated.length === 0
          ? `No live stream sources to update${
              result.skipped.length ? ` (skipped ${result.skipped.length} local-file source(s))` : ''
            }`
          : `Applied playback settings to ${result.updated.length} live stream source(s)${
              result.skipped.length ? `; skipped ${result.skipped.length} local-file source(s)` : ''
            }`,
      ...result,
    });
  } catch (error) {
    console.error('Error applying OBS playback settings:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to OBS or apply playback settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
