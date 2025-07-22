import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { TABLE_NAMES } from '@/lib/constants';
import { deleteTeamComponents, deleteStreamComponents, clearTextFilesForStream } from '@/lib/obsClient';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const { teamId: teamIdParam } = await params;
        const teamId = parseInt(teamIdParam);
        const body = await request.json();
        const { team_name, group_name, group_uuid } = body;
        
        // Allow updating any combination of fields
        if (!team_name && group_name === undefined && group_uuid === undefined) {
            return NextResponse.json({ error: 'At least one field (team_name, group_name, or group_uuid) must be provided' }, { status: 400 });
        }

        const db = await getDatabase();
        
        // Build dynamic query based on what fields are being updated
        const updates: string[] = [];
        const values: (string | number | null)[] = [];
        
        if (team_name) {
            updates.push('team_name = ?');
            values.push(team_name);
        }
        
        if (group_name !== undefined) {
            updates.push('group_name = ?');
            values.push(group_name);
        }
        
        if (group_uuid !== undefined) {
            updates.push('group_uuid = ?');
            values.push(group_uuid);
        }
        
        values.push(teamId);
        
        const result = await db.run(
            `UPDATE ${TABLE_NAMES.TEAMS} SET ${updates.join(', ')} WHERE team_id = ?`,
            values
        );
        
        if (result.changes === 0) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }
        
        return NextResponse.json({ message: 'Team updated successfully' });
    } catch (error) {
        console.error('Error updating team:', error);
        return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const { teamId: teamIdParam } = await params;
        const teamId = parseInt(teamIdParam);
        const db = await getDatabase();
        
        // First get the team and stream information before deletion
        const team = await db.get(
            `SELECT * FROM ${TABLE_NAMES.TEAMS} WHERE team_id = ?`,
            [teamId]
        );
        
        if (!team) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }
        
        // Get all streams for this team
        const streams = await db.all(
            `SELECT * FROM ${TABLE_NAMES.STREAMS} WHERE team_id = ?`,
            [teamId]
        );
        
        console.log(`Deleting team "${team.team_name}" with ${streams.length} streams`);
        
        // Try to clean up OBS components first
        let obsCleanupResults = null;
        try {
            // Delete each stream's OBS components
            for (const stream of streams) {
                try {
                    const groupName = team.group_name || team.team_name;
                    console.log(`Deleting OBS components for stream "${stream.name}"`);
                    
                    // Delete stream components
                    await deleteStreamComponents(stream.name, team.team_name, groupName);
                    
                    // Clear any text files that reference this stream
                    const cleanGroupName = groupName.toLowerCase().replace(/\s+/g, '_');
                    const cleanStreamName = stream.name.toLowerCase().replace(/\s+/g, '_');
                    const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
                    await clearTextFilesForStream(streamGroupName);
                } catch (streamError) {
                    console.error(`Error deleting stream "${stream.name}" OBS components:`, streamError);
                }
            }
            
            // Delete team-level OBS components
            obsCleanupResults = await deleteTeamComponents(team.team_name, team.group_name);
            console.log('Team OBS cleanup results:', obsCleanupResults);
            
        } catch (obsError) {
            console.error('Error during OBS cleanup:', obsError);
            // Continue with database deletion even if OBS cleanup fails
        }
        
        // Now delete from database
        await db.run('BEGIN TRANSACTION');
        
        try {
            // Delete all streams for this team
            await db.run(
                `DELETE FROM ${TABLE_NAMES.STREAMS} WHERE team_id = ?`,
                [teamId]
            );
            
            // Delete the team
            await db.run(
                `DELETE FROM ${TABLE_NAMES.TEAMS} WHERE team_id = ?`,
                [teamId]
            );
            
            await db.run('COMMIT');
            
            return NextResponse.json({ 
                message: 'Team and all associated components deleted successfully',
                deletedStreams: streams.length,
                obsCleanup: obsCleanupResults || 'OBS cleanup was not performed'
            });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
    }
}