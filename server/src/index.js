import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { generateCaptionDrafts } from './captions.js';
import { publishToMeta } from './meta.js';
import { checkWeatherTrigger, checkCalendarTriggers } from './seasonal.js';

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));

const PLATFORMS = ['instagram', 'facebook', 'nextdoor'];

app.post('/api/marketing/generate-captions', async (req, res) => {
  const { job, platform } = req.body || {};
  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of ${PLATFORMS.join(', ')}` });
  }
  try {
    const drafts = await generateCaptionDrafts(job, platform);
    res.json({ drafts });
  } catch (err) {
    console.error('generate-captions failed:', err);
    res.status(502).json({ error: err.message || 'Caption generation failed' });
  }
});

app.post('/api/marketing/publish', async (req, res) => {
  const { platform, caption, imageUrl } = req.body || {};
  if (platform !== 'instagram' && platform !== 'facebook') {
    return res.status(400).json({ error: 'publish only supports instagram or facebook — Nextdoor has no posting API.' });
  }
  if (!caption || !caption.trim()) {
    return res.status(400).json({ error: 'caption is required' });
  }
  try {
    const result = await publishToMeta({ platform, caption, imageUrl });
    res.json({ success: true, postId: result.postId });
  } catch (err) {
    console.error('publish failed:', err);
    // Non-2xx so the client keeps the entry "approved" and shows the error,
    // per spec: never silently fail.
    res.status(502).json({ success: false, error: err.message || 'Publish failed' });
  }
});

// Part 5 (optional). Stateless — just reports what's active today; the
// admin dashboard decides whether it's already drafted this season/event
// and does the content_queue insert client-side.
app.get('/api/marketing/seasonal-check', async (_req, res) => {
  try {
    const [weather, calendar] = await Promise.all([
      checkWeatherTrigger().catch((err) => ({ triggered: false, reason: err.message })),
      Promise.resolve(checkCalendarTriggers()),
    ]);
    const triggers = [...(weather.triggered ? [weather] : []), ...calendar];
    res.json({ triggers });
  } catch (err) {
    console.error('seasonal-check failed:', err);
    res.status(500).json({ error: err.message || 'Seasonal check failed' });
  }
});

app.get('/api/marketing/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`Community Butler marketing server listening on :${port}`);
});
