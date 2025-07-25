import fs from 'fs';
import path from 'path';
import { createSuccessResponse, createErrorResponse, withErrorHandling } from '../../../lib/apiHelpers';
import { SCREEN_POSITIONS } from '../../../lib/constants';

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files')
// Ensure directory exists
if (!fs.existsSync(FILE_DIRECTORY)) {
  fs.mkdirSync(FILE_DIRECTORY, { recursive: true });
}
console.log('using',  FILE_DIRECTORY)

async function getActiveHandler() {
    try {
        const activeSources: Record<string, string | null> = {};

        // Read each screen position file using the constant
        for (const screen of SCREEN_POSITIONS) {
            const filePath = path.join(FILE_DIRECTORY, `${screen}.txt`);
            activeSources[screen] = fs.existsSync(filePath) 
                ? fs.readFileSync(filePath, 'utf-8').trim() 
                : null;
        }

        return createSuccessResponse(activeSources);
    } catch (error) {
        console.error('Error reading active sources:', error);
        return createErrorResponse('Failed to read active sources', 500, 'Could not read source files', error);
    }
}

export const GET = withErrorHandling(getActiveHandler);