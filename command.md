# Command Reference

This file contains the basic setup and run commands for the `server` and `interface` projects.

## Initial Setup

### Server

```powershell
cd server
bun install
Copy-Item .env.example .env
```

### Interface

```powershell
cd interface
npm install
```

### Interface iOS Setup (macOS only)

```bash
cd interface
npm run pod-install
```

## Run The Server

### Development Mode With Bun Watch

```powershell
cd server
bun run dev
```

### Run Server With Bun

```powershell
cd server
bun run start:bun
```

### Run Server With Node

```powershell
cd server
bun run start
```

### Check Server Health

```powershell
curl.exe -s http://localhost:4000/api/health
```

## Run The Interface

### Start Metro Bundler

```powershell
cd interface
npm start
```

### Run Android App

```powershell
cd interface
npm run android
```

### Run iOS App

```bash
cd interface
npm run ios
```

## Recommended Local Workflow

Open separate terminals:

### Terminal 1

```powershell
cd server
bun run dev
```

### Terminal 2

```powershell
cd interface
npm start
```

### Terminal 3

```powershell
cd interface
npm run android
```

## Useful Interface Commands

```powershell
cd interface
npm run lint
npm test
```

## Useful Cleanup Command

```bash
cd interface
npm run clean
```
