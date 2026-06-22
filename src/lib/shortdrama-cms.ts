const SHORT_DRAMA_TYPE_ID = 30;

const CMS_SOURCES = [
  {
    name: '红牛资源',
    baseUrl: 'http://hongniuzy2.com/api.php/provide/vod/from/hnm3u8',
  },
  {
    name: '樱花资源',
    baseUrl: 'http://m3u8.apiyhzy.com/api.php/provide/vod',
  },
  {
    name: '无尽资源',
    baseUrl: 'https://api.wujinapi.me/api.php/provide/vod/',
  },
  {
    name: '360资源',
    baseUrl: 'https://360zy.com/api.php/provide/vod',
  },
];

interface CmsVodItem {
  vod_id?: number | string;
  id?: number | string;
  vod_name?: string;
  name?: string;
  vod_pic?: string;
  cover?: string;
  vod_time?: string;
  update_time?: string;
  vod_score?: number | string;
  vod_douban_score?: number | string;
  score?: number | string;
  vod_total?: number | string;
  vod_remarks?: string;
  vod_class?: string;
  vod_tag?: string;
  vod_year?: string;
  vod_content?: string;
  vod_blurb?: string;
  vod_play_url?: string;
}

interface CmsResponse {
  page?: number | string;
  pagecount?: number | string;
  total?: number | string;
  list?: CmsVodItem[];
  class?: Array<{
    type_id: number | string;
    type_name: string;
  }>;
}

export interface ShortDramaListItem {
  id: string;
  vod_id: number;
  name: string;
  cover: string;
  update_time: string;
  score: number;
  total_episodes?: string;
  vod_class?: string;
  vod_tag?: string;
}

interface ShortDramaEpisode {
  index: number;
  label: string;
  parsedUrl: string;
  parseInfo: {
    headers: {
      'User-Agent': string;
      Referer?: string;
    };
    type: 'hls' | 'mp4' | 'unknown';
  };
  status: 'success';
  reason: null;
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function buildCmsUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CMS request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFromCmsSources(params: Record<string, string>): Promise<{
  sourceName: string;
  data: CmsResponse;
}> {
  let lastError: unknown;

  for (const source of CMS_SOURCES) {
    try {
      const data = await fetchJsonWithTimeout<CmsResponse>(
        buildCmsUrl(source.baseUrl, params)
      );

      if (Array.isArray(data.list)) {
        return { sourceName: source.name, data };
      }

      lastError = new Error(`${source.name} returned invalid CMS data`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All CMS short drama sources failed');
}

export function normalizeCmsShortDramaItem(item: CmsVodItem): ShortDramaListItem {
  const rawId = item.vod_id ?? item.id ?? '';
  const vodId = toNumber(rawId);

  return {
    id: rawId.toString(),
    vod_id: vodId,
    name: item.vod_name || item.name || '未知短剧',
    cover: item.vod_pic || item.cover || '',
    update_time: item.vod_time || item.update_time || new Date().toISOString(),
    score: toNumber(item.vod_score ?? item.vod_douban_score ?? item.score),
    total_episodes:
      item.vod_total?.toString() ||
      item.vod_remarks?.replace(/[^0-9]/g, '') ||
      '1',
    vod_class: item.vod_class || '短剧',
    vod_tag: item.vod_tag || '',
  };
}

export async function fetchCmsShortDramaList(
  page: string,
  categoryId = SHORT_DRAMA_TYPE_ID.toString()
): Promise<{
  total: number;
  totalPages: number;
  currentPage: number;
  list: ShortDramaListItem[];
}> {
  const typeId = categoryId === '0' ? SHORT_DRAMA_TYPE_ID.toString() : categoryId;
  const { data } = await fetchFromCmsSources({
    ac: 'videolist',
    t: typeId,
    pg: page,
  });

  return {
    total: toNumber(data.total),
    totalPages: toNumber(data.pagecount, 1),
    currentPage: toNumber(data.page, toNumber(page, 1)),
    list: (data.list || []).map(normalizeCmsShortDramaItem),
  };
}

export async function fetchCmsShortDramaLatest(
  page: string
): Promise<ShortDramaListItem[]> {
  const response = await fetchCmsShortDramaList(
    page,
    SHORT_DRAMA_TYPE_ID.toString()
  );
  return response.list;
}

export async function fetchCmsShortDramaCategories(): Promise<{
  categories: Array<{ type_id: number; type_name: string }>;
  total: number;
}> {
  for (const source of CMS_SOURCES) {
    try {
      const data = await fetchJsonWithTimeout<CmsResponse>(
        buildCmsUrl(source.baseUrl, {})
      );
      const categories = (data.class || [])
        .filter((item) => toNumber(item.type_id) === SHORT_DRAMA_TYPE_ID)
        .map((item) => ({
          type_id: toNumber(item.type_id),
          type_name: item.type_name || '短剧',
        }));

      if (categories.length > 0) {
        return { categories, total: categories.length };
      }
    } catch {
      // Try the next CMS source.
    }
  }

  return {
    categories: [{ type_id: SHORT_DRAMA_TYPE_ID, type_name: '短剧' }],
    total: 1,
  };
}

function parseCmsEpisodes(playUrl: string): ShortDramaEpisode[] {
  const groups = playUrl
    .split('$$$')
    .map((group) => group.trim())
    .filter(Boolean);
  const entries = (groups.length > 0 ? groups : [playUrl])
    .flatMap((group) => group.split('#'))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries
    .map((entry, index): ShortDramaEpisode | null => {
      const dollarIndex = entry.indexOf('$');
      const label =
        dollarIndex >= 0 ? entry.slice(0, dollarIndex) : `第${index + 1}集`;
      const parsedUrl = dollarIndex >= 0 ? entry.slice(dollarIndex + 1) : entry;

      if (!/^https?:\/\//i.test(parsedUrl)) {
        return null;
      }

      const referer = parsedUrl.match(/^https?:\/\/[^/]+/)?.[0];
      const headers: ShortDramaEpisode['parseInfo']['headers'] = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      };

      if (referer) {
        headers.Referer = referer;
      }

      return {
        index,
        label: label || `第${index + 1}集`,
        parsedUrl,
        parseInfo: {
          headers,
          type: parsedUrl.includes('.m3u8')
            ? ('hls' as const)
            : parsedUrl.includes('.mp4')
              ? ('mp4' as const)
              : ('unknown' as const),
        },
        status: 'success' as const,
        reason: null,
      };
    })
    .filter((item): item is ShortDramaEpisode => Boolean(item));
}

export async function fetchCmsShortDramaDetail(id: string): Promise<{
  videoId: number;
  videoName: string;
  results: ShortDramaEpisode[];
  totalEpisodes: number;
  successfulCount: number;
  failedCount: number;
  cover: string;
  description: string;
  vodClass: string;
  vodTag: string;
}> {
  const { data } = await fetchFromCmsSources({
    ac: 'videolist',
    ids: id,
  });
  const item = data.list?.[0];

  if (!item) {
    throw new Error(`CMS short drama detail not found: ${id}`);
  }

  const results = parseCmsEpisodes(item.vod_play_url || '');

  if (results.length === 0) {
    throw new Error(`CMS short drama has no playable episodes: ${id}`);
  }

  return {
    videoId: toNumber(item.vod_id ?? item.id, toNumber(id)),
    videoName: item.vod_name || item.name || '短剧播放',
    results,
    totalEpisodes: results.length,
    successfulCount: results.length,
    failedCount: 0,
    cover: item.vod_pic || item.cover || '',
    description: item.vod_content || item.vod_blurb || '',
    vodClass: item.vod_class || '短剧',
    vodTag: item.vod_tag || '',
  };
}
