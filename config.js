// import path from 'path';
const path = require('path')
// let FILE_DIRECTORY = null;

const config = {
  FILE_DIRECTORY: path.resolve(process.env.FILE_DIRECTORY || './files'),
};


export function FILE_DIRECTORY() {
  return path.resolve(process.env.FILE_DIRECTORY || './files');
}
// export default config;
