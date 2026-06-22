/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Server } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface SourceItem {
  key: string;
  name: string;
}

interface SourceCategory {
  type_id: string;
  type_name: string;
  type_pid: string;
}

interface SourceVideoItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  episodes?: number;
  source: string;
  source_name: string;
  type_name?: string;
  vod_class?: string;
  vod_tag?: string;
}

interface SourceVideoResponse {
  total: number;
  totalPages: number;
  currentPage: number;
  list: SourceVideoItem[];
}

const skeletonData = Array.from({ length: 18 }, (_, index) => index);

function parsePage(value: string | null): number {
  const page = Number(value || '1');
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function ResourcesPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSourceRef = useRef(searchParams.get('source') || '');
  const initialTypeRef = useRef(searchParams.get('typeId') || '');
  const initialPageRef = useRef(parsePage(searchParams.get('page')));

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedSource, setSelectedSource] = useState(initialSourceRef.current);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState('');

  const [categories, setCategories] = useState<SourceCategory[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState(initialTypeRef.current);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');

  const [videos, setVideos] = useState<SourceVideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState('');
  const [currentPage, setCurrentPage] = useState(initialPageRef.current);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);
  const [videoReloadKey, setVideoReloadKey] = useState(0);

  const selectedSourceInfo = useMemo(
    () => sources.find((source) => source.key === selectedSource),
    [sources, selectedSource]
  );

  const groupedCategories = useMemo(() => {
    const categoryById = new Map(
      categories.map((category) => [category.type_id, category])
    );
    const childrenByParent = new Map<string, SourceCategory[]>();
    const roots: SourceCategory[] = [];

    categories.forEach((category) => {
      if (
        category.type_pid &&
        category.type_pid !== '0' &&
        categoryById.has(category.type_pid)
      ) {
        const children = childrenByParent.get(category.type_pid) || [];
        children.push(category);
        childrenByParent.set(category.type_pid, children);
      } else {
        roots.push(category);
      }
    });

    return roots.map((category) => ({
      category,
      children: childrenByParent.get(category.type_id) || [],
    }));
  }, [categories]);

  const replaceUrl = useCallback(
    (source: string, typeId: string, page: number) => {
      const params = new URLSearchParams();
      if (source) params.set('source', source);
      if (typeId) params.set('typeId', typeId);
      if (page > 1) params.set('page', page.toString());
      const queryString = params.toString();
      router.replace(queryString ? `/resources?${queryString}` : '/resources', {
        scroll: false,
      });
    },
    [router]
  );

  useEffect(() => {
    const controller = new AbortController();
    setSourcesLoading(true);
    setSourcesError('');

    const loadSources = async () => {
      try {
        const response = await fetch('/api/source-resources', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, '获取资源站失败'));
        }

        const data = (await response.json()) as { sources?: SourceItem[] };
        const nextSources = Array.isArray(data.sources) ? data.sources : [];
        setSources(nextSources);

        const initialSource = initialSourceRef.current;
        const hasInitialSource = nextSources.some(
          (source) => source.key === initialSource
        );
        const nextSource = hasInitialSource
          ? initialSource
          : nextSources[0]?.key || '';

        setSelectedSource(nextSource);
        if (!hasInitialSource) {
          setSelectedTypeId('');
          setCurrentPage(1);
        }
        replaceUrl(
          nextSource,
          hasInitialSource ? initialTypeRef.current : '',
          hasInitialSource ? initialPageRef.current : 1
        );
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSourcesError((error as Error).message || '获取资源站失败');
        }
      } finally {
        setSourcesLoading(false);
      }
    };

    loadSources();

    return () => controller.abort();
  }, [replaceUrl]);

  useEffect(() => {
    if (!selectedSource) {
      setCategories([]);
      setVideos([]);
      return;
    }

    const controller = new AbortController();
    setCategoriesLoading(true);
    setCategoriesError('');
    setCategories([]);
    setVideos([]);

    const loadCategories = async () => {
      try {
        const response = await fetch(
          `/api/source-categories?source=${encodeURIComponent(selectedSource)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(await readApiError(response, '获取分类失败'));
        }

        const data = (await response.json()) as {
          categories?: SourceCategory[];
        };
        const nextCategories = Array.isArray(data.categories)
          ? data.categories
          : [];
        setCategories(nextCategories);

        const hasSelectedType = nextCategories.some(
          (category) => category.type_id === selectedTypeId
        );
        const nextTypeId = hasSelectedType
          ? selectedTypeId
          : nextCategories[0]?.type_id || '';
        const nextPage = hasSelectedType ? currentPage : 1;

        setSelectedTypeId(nextTypeId);
        setCurrentPage(nextPage);
        replaceUrl(selectedSource, nextTypeId, nextPage);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setCategoriesError((error as Error).message || '获取分类失败');
        }
      } finally {
        setCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => controller.abort();
  }, [selectedSource, categoryReloadKey]);

  useEffect(() => {
    if (!selectedSource || !selectedTypeId) {
      setVideos([]);
      return;
    }

    const controller = new AbortController();
    setVideosLoading(true);
    setVideosError('');

    const loadVideos = async () => {
      try {
        const params = new URLSearchParams({
          source: selectedSource,
          typeId: selectedTypeId,
          page: currentPage.toString(),
        });
        const response = await fetch(`/api/source-videos?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, '获取列表失败'));
        }

        const data = (await response.json()) as SourceVideoResponse;
        setVideos(Array.isArray(data.list) ? data.list : []);
        setTotalPages(Math.max(1, Number(data.totalPages || 1)));
        setCurrentPage(Math.max(1, Number(data.currentPage || currentPage)));
        setTotal(Number(data.total || 0));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setVideosError((error as Error).message || '获取列表失败');
        }
      } finally {
        setVideosLoading(false);
      }
    };

    loadVideos();

    return () => controller.abort();
  }, [selectedSource, selectedTypeId, currentPage, videoReloadKey]);

  const handleSourceChange = (sourceKey: string) => {
    if (sourceKey === selectedSource) return;
    setSelectedSource(sourceKey);
    setSelectedTypeId('');
    setCurrentPage(1);
    setTotalPages(1);
    setVideos([]);
    replaceUrl(sourceKey, '', 1);
  };

  const handleCategoryChange = (typeId: string) => {
    if (typeId === selectedTypeId) return;
    setSelectedTypeId(typeId);
    setCurrentPage(1);
    setVideos([]);
    replaceUrl(selectedSource, typeId, 1);
  };

  const handlePageChange = (page: number) => {
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (nextPage === currentPage) return;
    setCurrentPage(nextPage);
    replaceUrl(selectedSource, selectedTypeId, nextPage);
  };

  const renderCategoryButton = (category: SourceCategory) => {
    const active = selectedTypeId === category.type_id;
    return (
      <button
        key={category.type_id}
        onClick={() => handleCategoryChange(category.type_id)}
        className={`h-8 px-3 text-xs sm:text-sm rounded-full border transition-colors whitespace-nowrap ${active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white/70 border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600 dark:bg-gray-800/70 dark:border-gray-700 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-400'
          }`}
      >
        {category.type_name}
      </button>
    );
  };

  return (
    <PageLayout activePath='/resources'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              资源站
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              {selectedSourceInfo
                ? `正在浏览 ${selectedSourceInfo.name}`
                : '按授权的视频源浏览分类内容'}
            </p>
          </div>

          <div className='space-y-4'>
            <div className='flex items-center gap-2 overflow-x-auto pb-1'>
              {sourcesLoading ? (
                <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
                  <Loader2 className='w-4 h-4 animate-spin' />
                  加载资源站...
                </div>
              ) : sources.length > 0 ? (
                sources.map((source) => {
                  const active = selectedSource === source.key;
                  return (
                    <button
                      key={source.key}
                      onClick={() => handleSourceChange(source.key)}
                      className={`h-9 px-4 inline-flex items-center gap-2 text-sm rounded-full border transition-colors whitespace-nowrap ${active
                        ? 'bg-gray-900 border-gray-900 text-white dark:bg-gray-100 dark:border-gray-100 dark:text-gray-900'
                        : 'bg-white/70 border-gray-200 text-gray-700 hover:border-gray-400 dark:bg-gray-800/70 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500'
                        }`}
                    >
                      <Server className='w-4 h-4' />
                      {source.name}
                    </button>
                  );
                })
              ) : (
                <div className='text-sm text-gray-500 dark:text-gray-400'>
                  暂无可用资源站
                </div>
              )}
            </div>

            {sourcesError && (
              <div className='text-sm text-red-600 dark:text-red-400'>
                {sourcesError}
              </div>
            )}

            {selectedSource && (
              <div className='space-y-3'>
                {categoriesLoading ? (
                  <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    加载分类...
                  </div>
                ) : categoriesError ? (
                  <div className='flex flex-wrap items-center gap-3 text-sm text-red-600 dark:text-red-400'>
                    <span>{categoriesError}</span>
                    <button
                      onClick={() => setCategoryReloadKey((key) => key + 1)}
                      className='inline-flex items-center gap-1 text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400'
                    >
                      <RefreshCw className='w-4 h-4' />
                      重试
                    </button>
                  </div>
                ) : groupedCategories.length > 0 ? (
                  <div className='space-y-3'>
                    {groupedCategories.map(({ category, children }) => (
                      <div
                        key={category.type_id}
                        className='flex flex-wrap items-center gap-2'
                      >
                        {renderCategoryButton(category)}
                        {children.map(renderCategoryButton)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='text-sm text-gray-500 dark:text-gray-400'>
                    该源暂无分类
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          {videosError && (
            <div className='mb-6 flex flex-wrap items-center justify-center gap-3 text-sm text-red-600 dark:text-red-400'>
              <span>{videosError}</span>
              <button
                onClick={() => setVideoReloadKey((key) => key + 1)}
                className='inline-flex items-center gap-1 text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400'
              >
                <RefreshCw className='w-4 h-4' />
                重试
              </button>
            </div>
          )}

          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
            {videosLoading
              ? skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
              : videos.map((item) => (
                <div key={`${item.source}-${item.id}`} className='w-full'>
                  <VideoCard
                    from='resource'
                    id={item.id}
                    source={item.source}
                    source_name={item.source_name}
                    title={item.title}
                    poster={item.poster}
                    year={item.year}
                    episodes={item.episodes}
                    type='tv'
                  />
                </div>
              ))}
          </div>

          {!videosLoading && !videosError && selectedTypeId && videos.length === 0 && (
            <div className='text-center text-gray-500 dark:text-gray-400 py-12'>
              暂无相关内容
            </div>
          )}

          {!videosLoading && videos.length > 0 && (
            <div className='mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-400'>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className='h-9 px-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-400'
              >
                <ChevronLeft className='w-4 h-4' />
                上一页
              </button>
              <div className='min-w-[9rem] text-center'>
                第 {currentPage} / {totalPages} 页
                {total > 0 && <span className='ml-2'>共 {total} 条</span>}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className='h-9 px-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-400'
              >
                下一页
                <ChevronRight className='w-4 h-4' />
              </button>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense fallback={null}>
      <ResourcesPageClient />
    </Suspense>
  );
}
