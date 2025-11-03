# Windows System Commands

This project is developed on **Windows**, so command-line operations use Windows-specific syntax.

## File System Navigation

### List Directory Contents
```powershell
# Command Prompt
dir

# PowerShell (also works in modern Windows Terminal)
ls
Get-ChildItem
```

### Change Directory
```powershell
cd path\to\directory
cd ..  # Go up one level
cd \   # Go to root
```

### Show Current Directory
```powershell
cd  # In Command Prompt
pwd # In PowerShell
```

## File Operations

### Create Directory
```powershell
mkdir directory_name
md directory_name
```

### Delete File
```powershell
del filename
Remove-Item filename
```

### Delete Directory
```powershell
rmdir directory_name
rd /s directory_name  # Recursively delete
Remove-Item -Recurse directory_name
```

### Copy Files
```powershell
copy source destination
Copy-Item source destination
```

### Move Files
```powershell
move source destination
Move-Item source destination
```

## Search Operations

### Find Files
```powershell
# Command Prompt - search recursively
dir /s /b *.ts

# PowerShell - more powerful
Get-ChildItem -Recurse -Filter "*.ts"
Get-ChildItem -Recurse -Include "*.ts","*.tsx"
```

### Search File Content
```powershell
# Command Prompt - findstr (like grep)
findstr /s /i "search term" *.ts
findstr /s /n /i "function" *.ts  # With line numbers

# PowerShell - Select-String (more powerful)
Select-String -Path "*.ts" -Pattern "search term"
Select-String -Recurse -Path . -Pattern "function"
```

## Process Management

### List Running Processes
```powershell
tasklist
Get-Process
```

### Kill Process
```powershell
taskkill /IM process_name.exe /F
Stop-Process -Name process_name
```

### Find Process Using Port
```powershell
netstat -ano | findstr :3000
```

## Environment Variables

### View Environment Variable
```powershell
echo %VARIABLE_NAME%  # Command Prompt
$env:VARIABLE_NAME    # PowerShell
```

### Set Environment Variable (Session)
```powershell
set VARIABLE_NAME=value  # Command Prompt
$env:VARIABLE_NAME = "value"  # PowerShell
```

## Git Commands (Cross-platform)

Git commands work the same on Windows:
```bash
git status
git add .
git commit -m "message"
git push
git pull
git log
git diff
```

## Path Separators

### Windows Uses Backslashes
```powershell
C:\Users\derek\source\repos\obs-ss-plugin-webui
.\files\database.db
```

### Forward Slashes Work in Many Contexts
```powershell
# Git, Node.js, and many tools accept forward slashes
./files/database.db
```

## Special Notes for This Project

### File Paths in Code
- Use forward slashes `/` or `path.join()` in Node.js code
- Windows handles both forward and backslashes in most cases
- Configuration files use forward slashes (`.env.local`, etc.)

### PowerShell vs Command Prompt
- **PowerShell** is recommended (more powerful, better scripting)
- **Command Prompt** works but has fewer features
- **Git Bash** is an alternative if installed
- **Windows Terminal** supports multiple shells

### NPM Commands
These work the same on Windows as on Unix:
```bash
npm install
npm run dev
npm run build
npm test
```

### Line Endings
- Windows uses CRLF (`\r\n`)
- Git usually configured to auto-convert
- EditorConfig or `.gitattributes` can enforce consistency
