import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { TABLE_NAMES } from '../../../lib/constants';
import { getOBSClient } from '../../../lib/obsClient';
import { buildStreamGroupName } from '../../../lib/streamGroupName';
import type { ObsClient } from '@/types/obsClient';

// System scenes that should not be considered orphaned
// These are infrastructure scenes that contain source switchers or other system components
const SYSTEM_SCENES: string[] = [
  '1-Screen',
  '2-Screen',
  '4-Screen',
  'Starting',
  'Ending',
  'Audio',
  'Movies',
  'Resources',
  'Donor',
  'BRB'
];

interface OBSScene {
  sceneName: string;
  sceneUuid: string;
}

export async function GET() {
  try {
    // Get teams and streams from database
    const db = await getDatabase();
    const teams = await db.all(`SELECT team_id, team_name, group_name, group_uuid FROM ${TABLE_NAMES.TEAMS} WHERE group_name IS NOT NULL OR group_uuid IS NOT NULL`);
    const streams = await db.all(`
      SELECT s.*, t.team_name, t.group_name as team_group_name 
      FROM ${TABLE_NAMES.STREAMS} s 
      LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id
    `);
    
    // Get scenes (groups) from OBS
    const obs: ObsClient = await getOBSClient();
    const { scenes } = await obs.call('GetSceneList');
    // obs-websocket-js v5 types scene items as loose JsonObject; cast to the
    // structured view this route relies on (sceneName / sceneUuid).
    const obsScenes = scenes as unknown as OBSScene[];
    
    // Compare database groups with OBS scenes using both UUID and name
    const verification = teams.map(team => {
      let exists_in_obs = false;
      let matched_by = null;
      let current_name = null;
      
      if (team.group_uuid) {
        // Try to match by UUID first (most reliable)
        const matchedScene = obsScenes.find(scene => scene.sceneUuid === team.group_uuid);
        if (matchedScene) {
          exists_in_obs = true;
          matched_by = 'uuid';
          current_name = matchedScene.sceneName;
        }
      }
      
      if (!exists_in_obs && team.group_name) {
        // Fallback to name matching
        const matchedScene = obsScenes.find(scene => scene.sceneName === team.group_name);
        if (matchedScene) {
          exists_in_obs = true;
          matched_by = 'name';
          current_name = matchedScene.sceneName;
        }
      }
      
      return {
        team_id: team.team_id,
        team_name: team.team_name,
        group_name: team.group_name,
        group_uuid: team.group_uuid,
        exists_in_obs,
        matched_by,
        current_name,
        name_changed: exists_in_obs && matched_by === 'uuid' && current_name !== team.group_name
      };
    });
    
    // Generate expected stream scene names based on the database. Use the same
    // group_name || team_name rule setActive/addStream apply — previously this
    // only emitted names for grouped teams, so streams on ungrouped teams had
    // their (team_name-based) scenes falsely reported as orphaned.
    const expectedStreamScenes = streams.map(stream =>
      buildStreamGroupName({
        name: stream.name,
        team_name: stream.team_name ?? null,
        group_name: stream.team_group_name,
      })
    );
    
    // Check for orphaned scenes - scenes that exist in OBS but aren't in our database
    const orphanedScenes = obsScenes.filter(scene => {
      // Check if it's a team scene
      const isTeamScene = teams.some(team => 
        team.group_uuid === scene.sceneUuid || team.group_name === scene.sceneName
      );
      
      // Check if it's an expected stream scene
      const isStreamScene = expectedStreamScenes.includes(scene.sceneName);
      
      // Check if it's a system scene
      const isSystemScene = SYSTEM_SCENES.includes(scene.sceneName);
      
      // It's orphaned if it's none of the above
      return !isTeamScene && !isStreamScene && !isSystemScene;
    });
    
    return NextResponse.json({
      success: true,
      data: {
        teams_with_groups: verification,
        obs_scenes: obsScenes.map(s => ({ name: s.sceneName, uuid: s.sceneUuid })),
        expected_stream_scenes: expectedStreamScenes,
        missing_in_obs: verification.filter(team => !team.exists_in_obs),
        name_mismatches: verification.filter(team => team.name_changed),
        orphaned_in_obs: orphanedScenes.map(s => ({ name: s.sceneName, uuid: s.sceneUuid }))
      }
    });
    
  } catch (error) {
    console.error('Error verifying groups:', error);
    return NextResponse.json(
      { error: 'Failed to verify groups with OBS' },
      { status: 500 }
    );
  }
}