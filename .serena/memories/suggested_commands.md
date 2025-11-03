# Suggested Commands

## Development Commands

### Start Development Server
```bash
npm run dev
```
Starts the Next.js development server (usually on http://localhost:3000)

### Build Production
```bash
npm run build
```
Creates optimized production build

### Start Production Server
```bash
npm start
```
Runs the production server (requires `npm run build` first)

## Code Quality

### Linting
```bash
npm run lint
```
Runs ESLint to check code quality and style issues

### Type Checking
```bash
npm run type-check
```
Runs TypeScript compiler in no-emit mode to check for type errors

## Testing

### Run Tests
```bash
npm test
```
Runs Jest test suite

### Watch Mode
```bash
npm run test:watch
```
Runs tests in watch mode for active development

### Coverage Report
```bash
npm run test:coverage
```
Generates test coverage report

### CI Testing
```bash
npm run test:ci
```
Runs tests in CI mode (no watch, with coverage)

## Database Management

### Create Seasonal Tables
```bash
npm run create-sat-summer-2025-tables
```
Creates database tables with seasonal naming convention (update season as needed)

### Migrate Group UUID
```bash
npm run add-group-uuid-column
```
One-time migration to add group_uuid column to teams table

## Git Commands (Windows)

### Common Git Operations
```bash
git status
git add .
git commit -m "message"
git push
git pull
```

## Windows File System Commands

### List Directory
```powershell
dir
# or
ls
```

### Change Directory
```powershell
cd path\to\directory
```

### Find Files
```powershell
dir /s /b *.ts
# or use PowerShell
Get-ChildItem -Recurse -Filter "*.ts"
```

### Search File Content
```powershell
findstr /s /i "search term" *.ts
# or use PowerShell
Select-String -Path "*.ts" -Pattern "search term"
```

## Environment Setup

Ensure `.env.local` file exists with:
```
FILE_DIRECTORY=./files
OBS_WEBSOCKET_HOST=127.0.0.1
OBS_WEBSOCKET_PORT=4455
OBS_WEBSOCKET_PASSWORD=your_password
API_KEY=your_api_key_for_production
```
