import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import Hls from 'hls.js';
import logo from './assets/hm-logo.svg';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function fetchShare(token) {
  return fetch(`${API_BASE}/share/${encodeURIComponent(token)}`).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to load gallery');
    }
    return response.json();
  });
}

function HomePage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const onSubmit = (event) => {
    event.preventDefault();
    const value = token.trim();
    if (!value) {
      setError('Please enter your gallery token.');
      return;
    }
    navigate(`/gallery/${encodeURIComponent(value)}`);
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <img src={logo} alt="HM Logo" className="brand-logo" />
        <div>
          <p className="eyebrow">HerringM Wedding Video</p>
          <h1>Private gallery access</h1>
          <p className="subtitle">Enter the secure token you received from your wedding filmmaker to open your gallery.</p>
        </div>
      </header>

      <section className="card centered-card">
        <form className="token-form" onSubmit={onSubmit}>
          <label htmlFor="token">Gallery token</label>
          <input
            id="token"
            value={token}
            onChange={(event) => { setToken(event.target.value); setError(null); }}
            placeholder="Paste your share token here"
          />
          {error && <p className="error">{error}</p>}
          <button className="button" type="submit">Open gallery</button>
        </form>
        <p className="helper-text">If you already have a gallery link, just visit it directly. Videos are available via secure token-only access.</p>
      </section>
    </div>
  );
}

function useShareGallery(token) {
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchShare(token)
      .then((data) => {
        setGallery(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setGallery(null);
        setLoading(false);
      });
  }, [token]);

  return { gallery, loading, error };
}

function GalleryPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { gallery, loading, error } = useShareGallery(token);

  const pageUrl = useMemo(() => window.location.href, [token]);

  if (!token) return <Navigate to="/" replace />;

  return (
    <div className="page-shell">
      <header className="page-header">
        <img src={logo} alt="HM Logo" className="brand-logo" />
        <div>
          <p className="eyebrow">Gallery</p>
          <h1>{gallery?.gallery?.title || 'Wedding gallery'}</h1>
          <p className="subtitle">Secure share token access only. Click a video to open its dedicated page.</p>
        </div>
      </header>

      <section className="toolbar">
        <button className="button" onClick={() => navigate(-1)}>Back</button>
        <button className="button secondary" onClick={() => copyText(pageUrl)}>Copy gallery link</button>
      </section>

      {loading && <div className="card"><p>Loading gallery…</p></div>}
      {error && <div className="card"><p className="error">{error}</p></div>}

      {gallery && (
        <>
          <section className="gallery-intro card">
            <div>
              <h2>{gallery.gallery.title}</h2>
              <p>{gallery.gallery.description}</p>
              <p className="meta">Client: {gallery.gallery.client_name}</p>
            </div>
            <div className="share-box">
              <p>Share this gallery:</p>
              <input readOnly value={pageUrl} />
              <button className="button secondary" onClick={() => copyText(pageUrl)}>Copy link</button>
            </div>
          </section>

          <section className="video-grid">
            {gallery.videos.length ? gallery.videos.map((video) => (
              <article key={video.id} className="video-card">
                {video.thumbnail_url ? <img src={video.thumbnail_url} alt={video.title} /> : <div className="thumbnail-placeholder">No thumbnail</div>}
                <div className="video-info">
                  <h3>{video.title}</h3>
                  <p>{video.description}</p>
                  <p className="meta">Duration: {video.duration_secs || 'TBD'} seconds</p>
                  <div className="video-actions">
                    <Link className="button" to={`/gallery/${encodeURIComponent(token)}/video/${video.id}`}>Open video</Link>
                    <button className="button secondary" onClick={() => copyText(`${window.location.origin}/gallery/${encodeURIComponent(token)}/video/${video.id}`)}>Copy link</button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="card"><p>No ready videos yet. Please check back later.</p></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function VideoPage() {
  const { token, videoId } = useParams();
  const navigate = useNavigate();
  const { gallery, loading, error } = useShareGallery(token);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    if (!gallery) return;
    const found = gallery.videos.find((video) => video.id === videoId);
    setSelectedVideo(found || null);
  }, [gallery, videoId]);

  const videoUrl = selectedVideo?.hls_url;
  const copyLink = () => copyText(window.location.href);

  if (!token) return <Navigate to="/" replace />;

  return (
    <div className="page-shell">
      <header className="page-header">
        <img src={logo} alt="HM Logo" className="brand-logo" />
        <div>
          <p className="eyebrow">Video</p>
          <h1>{selectedVideo?.title || 'Watch video'}</h1>
          <p className="subtitle">Dedicated video page for secure playback and sharing.</p>
        </div>
      </header>

      <section className="toolbar">
        <button className="button" onClick={() => navigate(-1)}>Back</button>
        <button className="button secondary" onClick={copyLink}>Copy video link</button>
      </section>

      {loading && <div className="card"><p>Loading video…</p></div>}
      {error && <div className="card"><p className="error">{error}</p></div>}
      {gallery && !selectedVideo && !loading && <div className="card"><p className="error">Video not found in this gallery.</p></div>}

      {selectedVideo && (
        <>
          <section className="video-player card">
            <div className="player-frame">
              <VideoPlayer src={videoUrl} poster={selectedVideo.thumbnail_url} />
            </div>
            <div className="video-meta">
              <h2>{selectedVideo.title}</h2>
              <p>{selectedVideo.description}</p>
              <p className="meta">Duration: {selectedVideo.duration_secs || 'TBD'} seconds</p>
            </div>
          </section>

          <section className="video-grid">
            {gallery.videos.map((video) => (
              <article key={video.id} className={`video-card ${video.id === selectedVideo.id ? 'active' : ''}`}>
                {video.thumbnail_url ? <img src={video.thumbnail_url} alt={video.title} /> : <div className="thumbnail-placeholder">No thumbnail</div>}
                <div className="video-info">
                  <h3>{video.title}</h3>
                  <p className="meta">{video.id === selectedVideo.id ? 'Playing now' : 'Tap to open'}</p>
                  {video.id !== selectedVideo.id && (
                    <Link className="button" to={`/gallery/${encodeURIComponent(token)}/video/${video.id}`}>Open</Link>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function VideoPlayer({ src, poster }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [src]);

  return <video ref={videoRef} controls poster={poster} className="player" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/gallery/:token" element={<GalleryPage />} />
      <Route path="/gallery/:token/video/:videoId" element={<VideoPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
