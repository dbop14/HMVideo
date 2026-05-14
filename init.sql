-- Wedding Videography Portal Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE galleries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,          -- used in share URL
  title       TEXT NOT NULL,
  client_name TEXT NOT NULL,
  description TEXT,
  cover_video_id UUID,                       -- set after first video added
  is_published BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id      UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  original_file   TEXT NOT NULL,             -- path to raw upload
  hls_path        TEXT,                      -- path to HLS master playlist
  thumbnail_path  TEXT,                      -- path to custom or auto thumbnail
  duration_secs   INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',
                                             -- pending | processing | ready | error
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE galleries
  ADD CONSTRAINT fk_cover FOREIGN KEY (cover_video_id)
  REFERENCES videos(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE share_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id  UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64url'),
  label       TEXT,                          -- e.g. "Sent to bride"
  expires_at  TIMESTAMPTZ,                   -- NULL = never
  last_viewed_at TIMESTAMPTZ,
  view_count  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Transcode job queue (polled by worker)
CREATE TABLE transcode_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | error
  error_msg   TEXT,
  attempts    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_videos_gallery   ON videos(gallery_id);
CREATE INDEX idx_videos_status    ON videos(status);
CREATE INDEX idx_share_tokens_tok ON share_tokens(token);
CREATE INDEX idx_transcode_status ON transcode_jobs(status, created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER t_galleries BEFORE UPDATE ON galleries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_videos    BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_jobs      BEFORE UPDATE ON transcode_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
