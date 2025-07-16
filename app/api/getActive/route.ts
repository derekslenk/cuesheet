import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// import config from '../../../config';

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files')
// Ensure directory exists
if (!fs.existsSync(FILE_DIRECTORY)) {
  fs.mkdirSync(FILE_DIRECTORY, { recursive: true });
}
console.log('using',  FILE_DIRECTORY)

export async function GET() {
    try {
        const largePath = path.join(FILE_DIRECTORY, 'large.txt');
        const leftPath = path.join(FILE_DIRECTORY, 'left.txt');
        const rightPath = path.join(FILE_DIRECTORY, 'right.txt');
        const topLeftPath = path.join(FILE_DIRECTORY, 'topLeft.txt');
        const topRightPath = path.join(FILE_DIRECTORY, 'topRight.txt');
        const bottomLeftPath = path.join(FILE_DIRECTORY, 'bottomLeft.txt');
        const bottomRightPath = path.join(FILE_DIRECTORY, 'bottomRight.txt');

        const tankPath = path.join(FILE_DIRECTORY, 'tank.txt');
        const treePath = path.join(FILE_DIRECTORY, 'tree.txt');
        const kittyPath = path.join(FILE_DIRECTORY, 'kitty.txt');
        const chickenPath = path.join(FILE_DIRECTORY, 'chicken.txt');

    
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const large = fs.existsSync(largePath) ? fs.readFileSync(largePath, 'utf-8') : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const left = fs.existsSync(leftPath) ? fs.readFileSync(leftPath, 'utf-8') : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const right = fs.existsSync(rightPath) ? fs.readFileSync(rightPath, 'utf-8') : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const topLeft = fs.existsSync(topLeftPath) ? fs.readFileSync(topLeftPath, 'utf-8') : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const topRight = fs.existsSync(topRightPath) ? fs.readFileSync(topRightPath, 'utf-8') : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const bottomLeft = fs.existsSync(bottomLeftPath) ? fs.readFileSync(bottomLeftPath, 'utf-8') : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const bottomRight = fs.existsSync(bottomRightPath) ? fs.readFileSync(bottomRightPath, 'utf-8') : null;

        const tank = fs.existsSync(tankPath) ? fs.readFileSync(tankPath, 'utf-8') : null;
        const tree = fs.existsSync(treePath) ?  fs.readFileSync(treePath, 'utf-8') : null;
        const kitty = fs.existsSync(kittyPath) ? fs.readFileSync(kittyPath, 'utf-8') : null;
        const chicken = fs.existsSync(chickenPath) ? fs.readFileSync(chickenPath, 'utf-8') : null;

        // For SaT
        // return NextResponse.json({ large, left, right, topLeft, topRight, bottomLeft, bottomRight }, {status: 201})
        return NextResponse.json({ tank, tree, kitty, chicken }, {status: 201})
      } catch (error) {
        console.error('Error reading active sources:', error);
        return NextResponse.json({ error: 'Failed to read active sources' }, {status: 500});
      }

}