import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { ApiSite, getAvailableApiSites, getConfig } from '@/lib/config';
import { fetchSourceCmsVideoList } from '@/lib/source-cms';

export const runtime = 'nodejs';

async function getAuthorizedSource(
  username: string,
  sourceKey: string
): Promise<{ source?: ApiSite; error?: string; status?: number }> {
  const config = await getConfig();
  const configuredSource = config.SourceConfig.find(
    (source) => source.key === sourceKey
  );

  if (!configuredSource || configuredSource.disabled) {
    return { error: '源不存在或已禁用', status: 404 };
  }

  const availableSources = await getAvailableApiSites(username);
  const source = availableSources.find((item) => item.key === sourceKey);

  if (!source) {
    return { error: '无权访问该视频源', status: 403 };
  }

  return { source };
}

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceKey = searchParams.get('source') || '';
  const typeId = searchParams.get('typeId') || '';
  const page = Math.max(1, Number(searchParams.get('page') || '1')).toString();

  if (!/^[\w-]+$/.test(sourceKey)) {
    return NextResponse.json({ error: '无效的视频源' }, { status: 400 });
  }

  if (!typeId) {
    return NextResponse.json({ error: '缺少分类参数' }, { status: 400 });
  }

  const { source, error, status } = await getAuthorizedSource(
    authInfo.username,
    sourceKey
  );

  if (!source) {
    return NextResponse.json({ error }, { status: status || 500 });
  }

  try {
    const data = await fetchSourceCmsVideoList(source, typeId, page);

    return NextResponse.json(
      {
        source: {
          key: source.key,
          name: source.name,
        },
        ...data,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (fetchError) {
    return NextResponse.json(
      { error: (fetchError as Error).message || '获取资源站列表失败' },
      { status: 502 }
    );
  }
}
