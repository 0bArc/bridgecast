# BridgeCast

Stream your local video library to phones, tablets, and browsers on your network.

BridgeCast scans a folder on your machine, discovers subfolders and video files, and serves them through a simple web UI with search, sorting, and optional per-folder passwords.

## Features

- First-run setup wizard (admin password + library folder path)
- Hierarchical library browsing (genre → category → …)
- Global search across all accessible videos
- Sort by name or file size
- JPEG poster thumbnails (requires [ffmpeg](https://ffmpeg.org/) on the server)
- HTTP range streaming for seeking on mobile
- Optional password-protected subfolders
- Settings page to change password, library path, and folder locks

## Requirements

- Node.js 18+
- ffmpeg (for thumbnails)

## Quick start

```bash
git clone <your-repo-url>
cd bridgecast
npm install
npm run dev
```

Open `http://localhost:3000` — you'll be guided through setup.

On first launch, BridgeCast creates `data/config.json` (gitignored) with a bcrypt password hash and your library path.

### Thumbnails

Pre-generate posters for faster browsing:

```bash
npm run thumbs
```

### Production

```bash
npm run build
npm run start
```

Set `PORT` if needed. Bind to your LAN with `--hostname 0.0.0.0` (default in scripts).

On Linux, restrict config permissions:

```bash
chmod 700 data
chmod 600 data/config.json
```

## Authentication

Two login tiers:

| Role | Password source | Access |
|------|-----------------|--------|
| **Admin** | `ADMIN_PASSWORD` in `.env` | Library + Settings |
| **Guest** | Set during setup / in Settings | Library only |

Add to `.env`:

```
ADMIN_PASSWORD=your-secret-admin-password
AUTH_SECRET=long-random-string
```

Guests use the password from the setup wizard (stored hashed in `data/config.json`).

## Configuration

All runtime settings live in `data/config.json`:

```json
{
  "version": 1,
  "viewerPasswordHash": "<bcrypt>",
  "sessionSecret": "<random hex>",
  "libraryRoot": "/path/to/your/videos",
  "setupComplete": true,
  "folderLocks": {
    "Private/Kids": { "passwordHash": "<bcrypt>" }
  }
}
```

Legacy `.env.local` (`APP_PASSWORD`, `LIBRARY_ROOT`, `AUTH_SECRET`) is auto-migrated on first read if no config file exists.

## Library layout

Point `libraryRoot` at any folder. Subfolders with videos (`.mp4`, `.webm`, `.mkv`, `.mov`) become browsable categories:

```
Movies/
  Action/
    movie1.mp4
  Documentaries/
    nature/
      ep01.mp4
```

## License

MIT
