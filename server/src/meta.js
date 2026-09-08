/*
 * publishToMeta — posts an approved caption to Instagram or Facebook via the
 * Meta Graph API, using a long-lived Page / Instagram Business access token.
 *
 * SETUP PREREQUISITE (flagging clearly, per the feature spec): this will not
 * work out of the box. Before it can publish anything you need:
 *   1. A Meta Developer app (developers.facebook.com).
 *   2. A Facebook Page, linked to an Instagram Business (or Creator) account.
 *   3. App review / permission grants for `pages_manage_posts` and
 *      `instagram_content_publish` (Instagram publishing also needs
 *      `instagram_basic` and `pages_read_engagement`).
 *   4. A long-lived Page access token (and the linked IG user id) in
 *      META_ACCESS_TOKEN / META_PAGE_ID / META_IG_USER_ID.
 * Until all of that is in place, expect every call here to fail — that's
 * expected, not a bug in this code. Nextdoor has no public posting API at
 * all, so it is never routed through this function (see contentQueue.ts /
 * MarketingTab.tsx — Nextdoor content only ever gets a copy-to-clipboard
 * staging card).
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Meta publishing requires a Meta Developer app + linked ` +
        'Facebook Page + Instagram Business account with app review approval — see server/README.md.',
    );
  }
  return value;
}

async function graphPost(path, body) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `Meta Graph API request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

async function publishFacebook(caption, imageUrl) {
  const pageId = requireEnv('META_PAGE_ID');
  const token = requireEnv('META_ACCESS_TOKEN');
  if (imageUrl) {
    const result = await graphPost(`/${pageId}/photos`, {
      url: imageUrl,
      caption,
      access_token: token,
    });
    return result.post_id || result.id;
  }
  const result = await graphPost(`/${pageId}/feed`, {
    message: caption,
    access_token: token,
  });
  return result.id;
}

async function publishInstagram(caption, imageUrl) {
  if (!imageUrl) {
    // Instagram's publishing API has no text-only post type — a photo is
    // required. Surfaced as a normal error so the admin UI shows it and the
    // entry stays "approved" (retryable) rather than silently failing.
    throw new Error('Instagram requires a photo — attach a job photo before publishing this post.');
  }
  const igUserId = requireEnv('META_IG_USER_ID');
  const token = requireEnv('META_ACCESS_TOKEN');
  const container = await graphPost(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });
  const published = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return published.id;
}

/**
 * publishToMeta({ platform, caption, imageUrl }) -> { postId }
 * Throws on any failure — callers keep the content_queue entry at "approved"
 * and surface the error message so the admin can fix and retry.
 */
export async function publishToMeta({ platform, caption, imageUrl }) {
  if (platform === 'facebook') {
    const postId = await publishFacebook(caption, imageUrl);
    return { postId };
  }
  if (platform === 'instagram') {
    const postId = await publishInstagram(caption, imageUrl);
    return { postId };
  }
  throw new Error(`publishToMeta does not support platform "${platform}" — Nextdoor has no posting API.`);
}
