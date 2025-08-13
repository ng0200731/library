@echo off
echo ========================================
echo    Image Library - Starting Web App
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Check if we're in the correct directory
if not exist "src\server.js" (
    echo ERROR: server.js not found in src directory
    echo Please run this batch file from the project root directory
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

echo Starting Image Library server...
echo.
echo The app will be available at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

REM Start the server
node src/server.js

REM If we get here, the server stopped
echo.
echo ========================================
echo Server stopped
echo ========================================
pause
