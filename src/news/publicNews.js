const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const NEWS_ALERT_WINDOW_MS = 12 * 60 * 60 * 1000;
export const isPublicNewsConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

function publicMediaUrl(storagePath) {
  if (!storagePath || !supabaseUrl) return "";
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${supabaseUrl}/storage/v1/object/public/news-media/${encodedPath}`;
}

function mapNewsItem(item) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    mediaType: item.media_type,
    mediaUrl: publicMediaUrl(item.media_storage_path),
    publishedAt: item.published_at,
  };
}

export async function loadPublishedNews({ limit = 50, signal } = {}) {
  if (!isPublicNewsConfigured) {
    throw new Error("Public news is not configured.");
  }

  const query = new URLSearchParams({
    select:
      "id,title,body,media_type,media_storage_path,published_at",
    is_published: "eq.true",
    published_at: `lte.${new Date().toISOString()}`,
    order: "published_at.desc",
    limit: String(limit),
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/news?${query}`, {
    headers: {
      apikey: supabasePublishableKey,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error("Published news could not be loaded.");
  }

  const items = await response.json();
  return items.map(mapNewsItem);
}

export function millisecondsUntilNewsAlertExpires(publishedAt) {
  const publishedTime = new Date(publishedAt).getTime();
  if (!Number.isFinite(publishedTime)) return 0;
  return Math.max(0, publishedTime + NEWS_ALERT_WINDOW_MS - Date.now());
}

export function isWithinNewsAlertWindow(publishedAt) {
  return millisecondsUntilNewsAlertExpires(publishedAt) > 0;
}
