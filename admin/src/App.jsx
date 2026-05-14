import { useEffect, useMemo, useState } from 'react';
import logo from './assets/hm-logo.svg';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const STORAGE_KEY = 'hm-video-admin-token';

function copyText(value) {
  navigator.clipboard.writeText(value).catch(() => {});
}

function App() {
  const [token, setToken] = useState(localStorage.getItem(STORAGE_KEY));
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState(null);
  const [galleryData, setGalleryData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadGalleries();
  }, [token]);

  useEffect(() => {
    if (!selectedGalleryId) return;
    loadGallery(selectedGalleryId);
  }, [selectedGalleryId]);

  const apiFetch = async (path, config = {}) => {
    const headers = config.headers || {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${path}`, { ...config, headers });
    if (response.status === 401) {
      logout();
      throw new Error('Session expired. Please sign in again.');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setGalleries([]);
    setGalleryData(null);
    setSelectedGalleryId(null);
    setMessage(null);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Login failed');
      setToken(body.token);
      localStorage.setItem(STORAGE_KEY, body.token);
      setPassword('');
      setMessage('Signed in successfully');
    } catch (err) {
      setError(err.message);
    }
  };

  const loadGalleries = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/galleries');
      setGalleries(data);
      if (data.length && !selectedGalleryId) setSelectedGalleryId(data[0].id);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const loadGallery = async (galleryId) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/galleries/${galleryId}`);
      setGalleryData(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const createGallery = async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      title: form.title.value.trim(),
      client_name: form.client_name.value.trim(),
      description: form.description.value.trim(),
    };
    if (!payload.title || !payload.client_name) {
      setError('Gallery title and client name are required.');
      return;
    }
    try {
      const gallery = await apiFetch('/galleries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setGalleries((current) => [gallery, ...current]);
      setSelectedGalleryId(gallery.id);
      form.reset();
      setMessage('Gallery created.');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const publishGallery = async (action) => {
    if (!galleryData) return;
    try {
      const updated = await apiFetch(`/galleries/${galleryData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: action === 'publish' }),
      });
      setGalleryData(updated);
      setGalleries((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(action === 'publish' ? 'Gallery published.' : 'Gallery unpublished.');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const createToken = async (event) => {
    event.preventDefault();
    if (!galleryData) return;
    const form = event.target;
    try {
      const result = await apiFetch(`/galleries/${galleryData.id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: form.label.value.trim(), expires_at: form.expires_at.value.trim() || null }),
      });
      setGalleryData((current) => ({ ...current, share_tokens: [result, ...(current.share_tokens || [])] }));
      form.reset();
      setMessage('Share link created.');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadVideo = async (event) => {
    event.preventDefault();
    if (!galleryData) return;
    const form = event.target;
    const file = form.video.files[0];
    if (!file) {
      setError('Select a video file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', form.title.value.trim());
    formData.append('description', form.description.value.trim());

    try {
      await apiFetch(`/videos/gallery/${galleryData.id}`, {
        method: 'POST',
        body: formData,
      });
      await loadGallery(galleryData.id);
      form.reset();
      setMessage('Video uploaded and queued for transcoding.');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadThumbnail = async (event, videoId) => {
    const file = event.target.files[0];
    if (!file || !galleryData) return;
    const formData = new FormData();
    formData.append('thumbnail', file);
    try {
      await apiFetch(`/videos/${videoId}/thumbnail/gallery/${galleryData.id}`, {
        method: 'POST',
        body: formData,
      });
      await loadGallery(galleryData.id);
      setMessage('Thumbnail updated.');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const galleryUrl = useMemo(() => {
    if (!galleryData || !galleryData.share_tokens?.length) return null;
    return `${window.location.origin}/gallery/${galleryData.share_tokens[0].token}`;
  }, [galleryData]);

  if (!token) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <img src={logo} alt="HM Logo" className="admin-logo" />
          <div>
            <p className="eyebrow">Admin dashboard</p>
            <h1>HerringM Video Portal</h1>
          </div>
        </header>
        <section className="admin-card">
          <h2>Sign in</h2>
          <form onSubmit={handleLogin} className="admin-form">
            <label>Admin password</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <p className="error">{error}</p>}
            <button className="button" type="submit">Sign in</button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <img src={logo} alt="HM Logo" className="admin-logo" />
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Manage galleries</h1>
        </div>
        <button className="button secondary" onClick={logout}>Sign out</button>
      </header>

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="admin-card">
            <h2>Galleries</h2>
            {loading && <p>Loading galleries…</p>}
            {!loading && galleries.length === 0 && <p>No galleries yet.</p>}
            <div className="gallery-list">
              {galleries.map((gallery) => (
                <button
                  key={gallery.id}
                  className={`gallery-item ${gallery.id === selectedGalleryId ? 'active' : ''}`}
                  onClick={() => setSelectedGalleryId(gallery.id)}
                >
                  <strong>{gallery.title}</strong>
                  <small>{gallery.client_name}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-card">
            <h2>Create gallery</h2>
            <form onSubmit={createGallery} className="admin-form">
              <label>Title</label>
              <input name="title" placeholder="Spring wedding" required />
              <label>Client name</label>
              <input name="client_name" placeholder="Alex & Jamie" required />
              <label>Description</label>
              <textarea name="description" placeholder="Optional gallery description" />
              <button className="button" type="submit">Create gallery</button>
            </form>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-card">
            <div className="section-header">
              <h2>Selected gallery</h2>
              <button className="button secondary" onClick={() => loadGallery(selectedGalleryId)}>Refresh</button>
            </div>
            {!galleryData && <p>Select a gallery to manage it.</p>}
            {galleryData && (
              <>
                <div className="gallery-summary">
                  <h3>{galleryData.title}</h3>
                  <p>{galleryData.description}</p>
                  <p className="meta">Client: {galleryData.client_name}</p>
                  <p className="meta">Published: {galleryData.is_published ? 'Yes' : 'No'}</p>
                </div>
                <div className="button-row">
                  <button className="button" onClick={() => publishGallery(galleryData.is_published ? 'unpublish' : 'publish')}>
                    {galleryData.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  {galleryUrl && <button className="button secondary" onClick={() => copyText(galleryUrl)}>Copy share link</button>}
                </div>

                <form onSubmit={createToken} className="admin-form small-form">
                  <label>Share label</label>
                  <input name="label" placeholder="Bride & Groom" />
                  <label>Expires at (UTC)</label>
                  <input name="expires_at" placeholder="2026-12-31T23:59:59Z" />
                  <button className="button" type="submit">Create public link</button>
                </form>
              </>
            )}
          </div>

          {galleryData && (
            <>
              <div className="admin-card">
                <h2>Upload video</h2>
                <form onSubmit={uploadVideo} className="admin-form">
                  <label>Title</label>
                  <input name="title" placeholder="Ceremony" />
                  <label>Description</label>
                  <textarea name="description" placeholder="Optional notes" />
                  <label>Video file</label>
                  <input name="video" type="file" accept="video/*" />
                  <button className="button" type="submit">Upload</button>
                </form>
              </div>

              <div className="admin-card">
                <h2>Videos</h2>
                {galleryData.videos.length === 0 && <p>No videos uploaded yet.</p>}
                <div className="video-list">
                  {galleryData.videos.map((video) => (
                    <div key={video.id} className="video-item">
                      <div>
                        <strong>{video.title}</strong>
                        <p className="meta">Status: {video.status}</p>
                      </div>
                      <label className="button small-button">
                        Upload thumbnail
                        <input type="file" accept="image/*" onChange={(event) => uploadThumbnail(event, video.id)} hidden />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {galleryData?.share_tokens?.length > 0 && (
            <div className="admin-card">
              <h2>Share links</h2>
              <div className="share-list">
                {galleryData.share_tokens.map((token) => (
                  <div key={token.id} className="share-item">
                    <span className="token-box">{token.token}</span>
                    <button className="button secondary" onClick={() => copyText(`${window.location.origin}/gallery/${token.token}`)}>Copy link</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {message && <div className="toast success">{message}</div>}
      {error && <div className="toast error">{error}</div>}
    </div>
  );
}

export default App;
