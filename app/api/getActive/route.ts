import fs from 'fs';
import path from 'path';
import { createSuccessResponse, createErrorResponse, withErrorHandling } from '../../../lib/apiHelpers';

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files')
// Ensure directory exists
if (!fs.existsSync(FILE_DIRECTORY)) {
  fs.mkdirSync(FILE_DIRECTORY, { recursive: true });
}
console.log('using',  FILE_DIRECTORY)

async function getActiveHandler() {
    try {
        const largePath = path.join(FILE_DIRECTORY, 'large.txt');
        const leftPath = path.join(FILE_DIRECTORY, 'left.txt');
        const rightPath = path.join(FILE_DIRECTORY, 'right.txt');
        const topLeftPath = path.join(FILE_DIRECTORY, 'topLeft.txt');
        const topRightPath = path.join(FILE_DIRECTORY, 'topRight.txt');
        const bottomLeftPath = path.join(FILE_DIRECTORY, 'bottomLeft.txt');
        const bottomRightPath = path.join(FILE_DIRECTORY, 'bottomRight.txt');

        const large = fs.existsSync(largePath) ? fs.readFileSync(largePath, 'utf-8').trim() : null;
        const left = fs.existsSync(leftPath) ? fs.readFileSync(leftPath, 'utf-8').trim() : null;
        const right = fs.existsSync(rightPath) ? fs.readFileSync(rightPath, 'utf-8').trim() : null;
        const topLeft = fs.existsSync(topLeftPath) ? fs.readFileSync(topLeftPath, 'utf-8').trim() : null;
        const topRight = fs.existsSync(topRightPath) ? fs.readFileSync(topRightPath, 'utf-8').trim() : null;
        const bottomLeft = fs.existsSync(bottomLeftPath) ? fs.readFileSync(bottomLeftPath, 'utf-8').trim() : null;
        const bottomRight = fs.existsSync(bottomRightPath) ? fs.readFileSync(bottomRightPath, 'utf-8').trim() : null;

        return createSuccessResponse({
            large,
            left,
            right,
            topLeft,
            topRight,
            bottomLeft,
            bottomRight
        });
    } catch (error) {
        console.error('Error reading active sources:', error);
        return createErrorResponse('Failed to read active sources', 500, 'Could not read source files', error);
    }
}

export const GET = withErrorHandling(getActiveHandler);