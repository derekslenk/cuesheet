import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { connectToOBS, getOBSClient, addSourceToSwitcher, createStreamGroupV2 } from '../../../lib/obsClient';
import { TABLE_NAMES, SOURCE_SWITCHER_NAMES } from '../../../lib/constants';
import { withDb } from '../../../lib/db';
import { relayUdpUrl } from '../../../lib/relayPort';
import { requestSupervisorReload } from '../../../lib/supervisorClient';
import type { ObsClient } from '@/types/obsClient';
import { buildStreamGroupName } from '../../../lib/streamGroupName';

const screens = SOURCE_SWITCHER_NAMES;

async function fetchTeamInfo(teamId: number) {
  try {
    return await withDb((db) =>
      db.get(
        `SELECT team_name, group_name, group_uuid FROM ${TABLE_NAMES.TEAMS} WHERE team_id = ?`,
        [teamId]
      )
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching team info:', error.message);
    } else {
      console.error('An unknown error occurred:', error);
    }
    return null;
  }
}


import { validateStreamInput } from '../../../lib/security';

// Generate OBS source name from team scene name and stream name
function generateOBSSourceName(teamSceneName: string, streamName: string): string {
  const cleanTeamName = teamSceneName.toLowerCase().replace(/\s+/g, '_');
  const cleanStreamName = streamName.toLowerCase().replace(/\s+/g, '_');
  return `${cleanTeamName}_${cleanStreamName}`;
}

export async function POST(request: NextRequest) {
  let name: string, url: string, team_id: number, obs_source_name: string, lockSources: boolean;
  let streamId: number | undefined; // set after the up-front insert; used for relay port + rollback
  let role: string | null = null; // optional player role shown on the label

  // Parse and validate request body
  try {
    const body = await request.json();
    const validation = validateStreamInput(body);

    if (!validation.valid) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validation.errors 
      }, { status: 400 });
    }

    ({ name, url, team_id } = validation.data!);
    lockSources = body.lockSources !== false; // Default to true if not specified
    role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : null;

  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
    // Fetch team info first to generate proper OBS source name
    const teamInfo = await fetchTeamInfo(team_id);
    if (!teamInfo) {
      throw new Error('Team not found');
    }
    
    console.log('Team Info:', teamInfo);
    
    // Use group_name if it exists, otherwise use team_name
    const groupName = teamInfo.group_name || teamInfo.team_name;
    
    // Generate OBS source name with team scene name prefix
    obs_source_name = generateOBSSourceName(groupName, name);

    const db = await getDatabase();

    // Reject duplicates up-front. The OBS source name is the collision key:
    // re-adding the same name to the same team would stack a second scene item
    // onto the existing nested scene and spawn a second Streamlink session for
    // the same channel (observed live as DB rows 335/336 both pointing at one
    // OBS scene).
    const duplicate = await db.get(
      `SELECT id, name FROM ${TABLE_NAMES.STREAMS} WHERE obs_source_name = ?`,
      [obs_source_name]
    );
    if (duplicate) {
      return NextResponse.json({
        error: 'Stream already exists',
        details: [`"${duplicate.name}" is already added to this team (stream id ${duplicate.id}). Delete it first to re-add.`],
      }, { status: 409 });
    }

    // Insert the stream row up-front so we have a stable id for the deterministic
    // relay port. The DB keeps the upstream (Twitch) url — the Streamlink
    // supervisor needs it; OBS instead gets a local UDP relay url derived from
    // this id (lib/relayPort). Rolled back in the catch if OBS wiring fails.
    const insertResult = await db.run(
      `INSERT INTO ${TABLE_NAMES.STREAMS} (name, obs_source_name, url, team_id, role) VALUES (?, ?, ?, ?, ?)`,
      [name, obs_source_name, url, team_id, role]
    );
    streamId = insertResult.lastID as number;

    // ffmpeg_source (Streamlink-backed Media Source) is the default — this is
    // the OOM fix (no CEF browser per stream). STREAM_USE_FFMPEG=false falls
    // back to a browser_source pointed at the Twitch URL (documented rollback).
    const useFfmpeg = process.env.STREAM_USE_FFMPEG !== 'false';
    const obsInputUrl = useFfmpeg ? relayUdpUrl(streamId) : url;

    // Connect to OBS WebSocket
    console.log("Pre-connect")
    await connectToOBS();
    console.log('Pre client')
    const obs: ObsClient = await getOBSClient();
    let inputs;
    try {
      const response = await obs.call('GetInputList');
      inputs = response.inputs;
    } catch (err) {
      if (err instanceof Error) {
        console.error('Failed to fetch inputs:', err.message);
      } else {
        console.error('Failed to fetch inputs:', err);
      }
      throw new Error('GetInputList failed.');
    }

    const sourceExists = inputs.some((input) => input.inputName === obs_source_name);

    if (!sourceExists) {
      // Create stream group with text overlay. V2 creates an ffmpeg_source
      // (Media Source) fed by the Streamlink supervisor over the local UDP
      // relay, or a browser_source when useFfmpeg is false (rollback).
      await createStreamGroupV2(groupName, name, teamInfo.team_name, obsInputUrl, { useFfmpegSource: useFfmpeg, lockSources, streamId });
      
      // Update team with group UUID if not set
      if (!teamInfo.group_uuid) {
        try {
          // Get the scene UUID for the group
          const obsClient = await getOBSClient();
          const { scenes } = await obsClient.call('GetSceneList');
          const scene = scenes.find((s: { sceneName: string; sceneUuid: string }) => s.sceneName === groupName);

          if (scene) {
            await withDb(async (db) => {
              await db.run(
                `UPDATE ${TABLE_NAMES.TEAMS} SET group_name = ?, group_uuid = ? WHERE team_id = ?`,
                [groupName, scene.sceneUuid, team_id]
              );
            });
            console.log(`Updated team ${team_id} with group UUID: ${scene.sceneUuid}`);
          } else {
            console.log(`Scene "${groupName}" not found in OBS`);
          }
        } catch (error) {
          console.error('Error updating team group UUID:', error);
        }
      }

      console.log(`OBS source "${obs_source_name}" created.`);

      for (const screen of screens) {
        try {
          const streamGroupName = buildStreamGroupName({ name, team_name: teamInfo.team_name, group_name: teamInfo.group_name });
          await addSourceToSwitcher(screen, [
            { hidden: false, selected: false, value: streamGroupName },
          ]);
        } catch (error) {
        if (error instanceof Error) {
            console.error(`Failed to add source to ${screen}:`, error.message);
        } else {
            console.error(`Failed to add source to ${screen}:`, error);
        }
        }
      }
      
    } else {
      console.log(`OBS source "${obs_source_name}" already exists.`);
    }

    // The OBS WebSocket client is a persistent singleton (lib/obsClient) shared
    // by every OBS route — do NOT disconnect here, or the next OBS op (another
    // add, a delete, a scene switch) has to re-pay the connect+identify
    // handshake. See docs/full-review-2026-06 (P-H2/P-L3).
    // Tell the supervisor to pick up the new stream immediately (best-effort;
    // non-fatal if it isn't running). Without this the ffmpeg_source shows a
    // gray box until the supervisor is restarted.
    await requestSupervisorReload();
    return NextResponse.json(
      { message: 'Stream added successfully', useFfmpegSource: useFfmpeg, obsInputUrl },
      { status: 201 }
    )
} catch (error) {
if (error instanceof Error) {
    console.error('Error adding stream:', error.message);
} else {
    console.error('An unknown error occurred while adding stream:', error);
}
// Roll back the up-front insert so a failed OBS wiring doesn't orphan a row
// (which would otherwise produce a duplicate on the next add attempt).
if (streamId !== undefined) {
  try {
    const db = await getDatabase();
    await db.run(`DELETE FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`, [streamId]);
  } catch (cleanupErr) {
    console.error('Failed to roll back stream row after OBS error:', cleanupErr);
  }
}
return NextResponse.json({ error: 'Failed to add stream' }, { status: 500 });
}
}