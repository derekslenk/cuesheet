import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { TABLE_NAMES } from '../../../lib/constants';
import { getOBSClient } from '../../../lib/obsClient';

interface OBSScene {
  sceneName: string;
  sceneUuid: string;
}

interface GetSceneListResponse {
  scenes: OBSScene[];
}

export async function GET() {
  try {
    // Get teams from database
    const db = await getDatabase();
    const teams = await db.all(`SELECT team_id, team_name, group_name, group_uuid FROM ${TABLE_NAMES.TEAMS} WHERE group_name IS NOT NULL OR group_uuid IS NOT NULL`);
    
    // Get scenes (groups) from OBS
    const obs = await getOBSClient();
    const response = await obs.call('GetSceneList');
    const obsData = response as GetSceneListResponse;
    const obsScenes = obsData.scenes;
    
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
    
    return NextResponse.json({
      success: true,
      data: {
        teams_with_groups: verification,
        obs_scenes: obsScenes.map(s => ({ name: s.sceneName, uuid: s.sceneUuid })),
        missing_in_obs: verification.filter(team => !team.exists_in_obs),
        name_mismatches: verification.filter(team => team.name_changed),
        orphaned_in_obs: obsScenes.filter(scene => 
          !teams.some(team => team.group_uuid === scene.sceneUuid || team.group_name === scene.sceneName)
        ).map(s => ({ name: s.sceneName, uuid: s.sceneUuid }))
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