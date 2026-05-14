# Wedding Videography Portal

This project provides a complete wedding video management system with a public client portal, branded admin UI, backend API, and automated video processing.

## Features
- **Client Portal**: Public-facing gallery and video viewer with share token authentication
- **Admin Dashboard**: Branded management interface for creating galleries, uploading videos, generating share links
- **Video Processing**: FFmpeg worker for HLS transcoding and thumbnail generation
- **Media Storage**: Configurable media storage via environment variables
- **Nginx Reverse Proxy**: Serves static assets and proxies API requests
- **PostgreSQL Database**: Persistent data storage with custom schema

## Architecture

```
nginx (reverse proxy) → client UI, admin UI, API routes
   ├── /           → React client portal
   ├── /admin      → React admin dashboard
   ├── /api        → Express.js backend
   ├── /hls        → HLS video streams
   └── /thumbnails → Video thumbnails

API ↔ PostgreSQL (galleries, videos, share tokens)
Worker ↔ PostgreSQL (video job queue)
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- FFmpeg (included in worker container)

## Deployment

### Local Development

1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Update `.env` with your values:
   ```
   POSTGRES_PASSWORD=your_secure_password
   JWT_SECRET=your_32_char_secret_key
   ADMIN_PASSWORD=your_admin_password
   MEDIA_ROOT=./media
   DOMAIN=yourdomain.com
   ```

3. Build and start the stack:
   ```bash
   docker compose up --build
   ```

4. Access the services:
   - Client portal: http://localhost/
   - Admin UI: http://localhost/admin
   - API documentation: http://localhost/api/

### Production Deployment

#### Option 1: Docker Compose (Recommended)

1. Copy the example config:
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   ```

2. Update `.env` with production values and absolute media paths

3. Start the stack:
   ```bash
   docker compose up -d
   ```

#### Option 2: Portainer

Portainer provides a web UI for managing Docker Compose stacks:

1. Copy `docker-compose.example.yml` contents
2. In Portainer: Stacks → Add Stack → Web Editor
3. Paste the compose file and set environment variables
4. Deploy

#### Option 3: Build Images First (Recommended for Portainer)

For environments where Portainer can't access build contexts:

```bash
docker build -t hmvideo-api:latest .
docker build -t hmvideo-worker:latest -f Dockerfile.worker .
docker build -t hmvideo-client:latest ./client
docker build -t hmvideo-admin:latest ./admin
```

Then use `docker-compose.yml` with image references instead of build contexts.

## Configuration

### Environment Variables

- `POSTGRES_PASSWORD`: Database password (⚠️ generate a strong random string)
- `JWT_SECRET`: JWT signing key (⚠️ minimum 32 characters, random)
- `ADMIN_PASSWORD`: Admin dashboard login password
- `MEDIA_ROOT`: Host path for media storage (e.g., `/data/videos` or `./media`)
- `DOMAIN`: Your domain name for SSL/Nginx config

### Media Storage

By default, media is stored in `./media/` (relative to docker-compose.yml). For production:

1. Create a directory on your host:
   ```bash
   mkdir -p /mnt/media/hmvideo
   chmod 755 /mnt/media/hmvideo
   ```

2. Update `.env`:
   ```
   MEDIA_ROOT=/mnt/media/hmvideo
   ```

3. Restart containers:
   ```bash
   docker compose down
   docker compose up -d
   ```

### SSL Certificates

Place SSL certificates in `./nginx/certs/`:
- Certificate: `./nginx/certs/server.crt`
- Key: `./nginx/certs/server.key`

Update `nginx.conf` to enable HTTPS if needed.

## API Endpoints

### Public

- `GET /api/shares/:token` - Get gallery by share token
- `GET /api/galleries/:id/videos` - Get videos in a gallery

### Admin (Requires Authentication)

- `POST /api/login` - Admin login
- `POST /api/galleries` - Create gallery
- `POST /api/videos` - Upload video
- `POST /api/shares` - Generate share token
- `PATCH /api/galleries/:id` - Update gallery

## Development

### Local Setup

1. Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ../admin && npm install && cd ..
   ```

2. Start PostgreSQL:
   ```bash
   docker compose up postgres
   ```

3. Run API server:
   ```bash
   npm start
   ```

4. Run client and admin in separate terminals:
   ```bash
   cd client && npm run dev
   cd admin && npm run dev
   ```

### File Structure

```
├── client/               # React client portal (Vite)
├── admin/                # React admin dashboard (Vite)
├── routes/               # Express.js API routes
├── nginx/                # Nginx configuration
│   ├── nginx.conf
│   └── certs/            # SSL certificates
├── fonts/                # Branded fonts (Montserrat)
├── docker-compose.yml    # Docker Compose config (production)
├── docker-compose.example.yml  # Template for production
├── Dockerfile            # API/Worker base
├── Dockerfile.worker     # Worker-specific image
├── init.sql              # Database schema
└── worker.js             # FFmpeg video processor
```

## Troubleshooting

### Build fails on Portainer
Portainer's web editor doesn't have access to local build contexts. Use pre-built images or use Option 3 above.

### Media files not accessible
Ensure `MEDIA_ROOT` path exists and Docker has read/write permissions.

### Admin login fails
Verify `ADMIN_PASSWORD` is set correctly in `.env` and containers are restarted after changes.

### Videos not transcoding
Check worker logs: `docker compose logs worker`

## Security Notes

⚠️ **NEVER commit `.env` or `docker-compose.yml` to version control** - these contain secrets.

- Generate strong, random passwords and secrets
- Use HTTPS in production (enable in `nginx.conf`)
- Restrict admin access via firewall/VPN
- Regularly backup PostgreSQL data volume
- Keep Docker and images updated

## Branding

The UI uses colors from `HM Logo.svg` and the "Montserrat" font family. To customize:

1. Update `HM Logo.svg` and regenerate color scheme
2. Update font files in `fonts/` directory
3. Rebuild client and admin containers

## License

© 2026 Wedding Videography

## Notes
- The API stores uploads in Docker volumes at `/data/uploads`, `/data/hls`, `/data/thumbnails`.
- The worker requires `ffmpeg` in its container and processes queued videos.
- Admin login uses `ADMIN_PASSWORD` from the `.env` file.
