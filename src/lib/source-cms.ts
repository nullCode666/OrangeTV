import { API_CONFIG, ApiSite } from '@/lib/config';
import { cleanHtmlTags } from '@/lib/utils';

interface CmsCategoryItem {
  type_id?: number | string;
  type_name?: string;
  type_pid?: number | string;
}

interface CmsVodItem {
  vod_id?: number | string;
  id?: number | string;
  vod_name?: string;
  name?: string;
  vod_pic?: string;
  cover?: string;
  vod_year?: string;
  vod_time?: string;
  vod_total?: number | string;
  vod_remarks?: string;
  vod_class?: string;
  vod_tag?: string;
  vod_content?: string;
  vod_blurb?: string;
  vod_play_url?: string;
  type_id?: number | string;
  type_name?: string;
}

interface CmsResponse {
  page?: number | string;
  pagecount?: number | string;
  total?: number | string;
  class?: CmsCategoryItem[];
  list?: CmsVodItem[];
}

export interface SourceCmsCategory {
  type_id: string;
  type_name: string;
  type_pid: string;
}

export interface SourceCmsVideoItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  episodes?: number;
  source: string;
  source_name: string;
  type_id?: string;
  type_name?: string;
  vod_class?: string;
  vod_tag?: string;
  remarks?: string;
  update_time?: string;
  desc?: string;
}

export interface SourceCmsVideoList {
  total: number;
  totalPages: number;
  currentPage: number;
  list: SourceCmsVideoItem[];
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toStringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function buildCmsUrl(api: string, params: Record<string, string>): string {
  const url = new URL(api);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function fetchCmsJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: API_CONFIG.search.headers,
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

function normalizeCategory(item: CmsCategoryItem): SourceCmsCategory | null {
  const typeId = toStringValue(item.type_id).trim();
  const typeName = toStringValue(item.type_name).trim();

  if (!typeId || !typeName) {
    return null;
  }

  return {
    type_id: typeId,
    type_name: typeName,
    type_pid: toStringValue(item.type_pid, '0').trim() || '0',
  };
}

function extractYear(item: CmsVodItem): string {
  const fromYear = item.vod_year?.match(/\d{4}/)?.[0];
  if (fromYear) return fromYear;

  const fromTime = item.vod_time?.match(/\d{4}/)?.[0];
  return fromTime || 'unknown';
}

function extractEpisodeCount(item: CmsVodItem): number | undefined {
  const fromTotal = toNumber(item.vod_total);
  if (fromTotal > 0) return fromTotal;

  const remarksCount = item.vod_remarks?.match(/\d+/)?.[0];
  if (remarksCount) return toNumber(remarksCount);

  if (item.vod_play_url) {
    const count = item.vod_play_url
      .split('$$$')
      .flatMap((group) => group.split('#'))
      .map((entry) => entry.trim())
      .filter(Boolean).length;
    return count > 0 ? count : undefined;
  }

  return undefined;
}

function normalizeVideoItem(
  item: CmsVodItem,
  apiSite: ApiSite
): SourceCmsVideoItem | null {
  const rawId = item.vod_id ?? item.id;
  const id = toStringValue(rawId).trim();
  const title = toStringValue(item.vod_name ?? item.name).trim();

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    poster: toStringValue(item.vod_pic ?? item.cover),
    year: extractYear(item),
    episodes: extractEpisodeCount(item),
    source: apiSite.key,
    source_name: apiSite.name,
    type_id: toStringValue(item.type_id) || undefined,
    type_name: item.type_name,
    vod_class: item.vod_class,
    vod_tag: item.vod_tag,
    remarks: item.vod_remarks,
    update_time: item.vod_time,
    desc: cleanHtmlTags(item.vod_content || item.vod_blurb || ''),
  };
}

export async function fetchSourceCmsCategories(
  apiSite: ApiSite
): Promise<SourceCmsCategory[]> {
  const data = await fetchCmsJson<CmsResponse>(
    buildCmsUrl(apiSite.api, { ac: 'list' })
  );

  if (!Array.isArray(data.class)) {
    throw new Error('资源站分类数据无效');
  }

  return data.class
    .map(normalizeCategory)
    .filter((item): item is SourceCmsCategory => Boolean(item));
}

export async function fetchSourceCmsVideoList(
  apiSite: ApiSite,
  typeId: string,
  page: string
): Promise<SourceCmsVideoList> {
  const data = await fetchCmsJson<CmsResponse>(
    buildCmsUrl(apiSite.api, {
      ac: 'videolist',
      t: typeId,
      pg: page,
    })
  );

  if (!Array.isArray(data.list)) {
    throw new Error('资源站列表数据无效');
  }

  return {
    total: toNumber(data.total),
    totalPages: toNumber(data.pagecount, 1),
    currentPage: toNumber(data.page, toNumber(page, 1)),
    list: data.list
      .map((item) => normalizeVideoItem(item, apiSite))
      .filter((item): item is SourceCmsVideoItem => Boolean(item)),
  };
}
