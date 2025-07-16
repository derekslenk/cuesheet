import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { Stream } from '@/types';
import { TABLE_NAMES } from '../../../lib/constants';

export async function GET() {
try {
    const db = await getDatabase();
    const streams: Stream[] = await db.all(`SELECT * FROM ${TABLE_NAMES.STREAMS}`);
    return NextResponse.json(streams);
} catch (error) {
    console.error('Error fetching streams:', error);
    return NextResponse.json(
    { error: 'Failed to fetch streams' },
    { status: 500 }
    );
}
}
