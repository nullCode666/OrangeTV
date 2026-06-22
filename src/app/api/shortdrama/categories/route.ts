import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/config';
import { fetchCmsShortDramaCategories } from '@/lib/shortdrama-cms';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    // 先尝试调用外部API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

    const response = await fetch(`${API_CONFIG.shortdrama.baseUrl}/vod/categories`, {
      method: 'GET',
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    } else {
      throw new Error(`External API failed: ${response.status}`);
    }
  } catch (error) {
    console.error('Short drama categories API error:', error);

    const fallbackData = await fetchCmsShortDramaCategories();
    return NextResponse.json(fallbackData);
  }
}
