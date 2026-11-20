export interface CacheEntry<T> {
  data: T;
  nextUrl?: string;
  expiresAt: number;
}

export interface CanvasClientOptions {
  baseUrl: string;
  accessToken: string;
  cacheTtlMs?: number;
  fetchFn?: typeof fetch;
}

export class CanvasClient {
  private baseUrl: string;
  private accessToken: string;
  private cacheTtlMs: number;
  private fetchFn: typeof fetch;
  private cache = new Map<string, CacheEntry<unknown>>();

  // Rate limit tracking (critique §3.2)
  private remainingCost: number | null = null;

  constructor(options: CanvasClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.accessToken = options.accessToken;
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000; // default 30 seconds
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  getRateLimitRemaining(): number | null {
    return this.remainingCost;
  }

  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Performs an authenticated Canvas API request with masquerading support (as_user_id),
   * rate-limit tracking, Link-header pagination, and short-TTL caching.
   */
  async get<T>(
    endpoint: string,
    params: {
      asUserId?: string;
      query?: Record<string, string | number | boolean | string[]>;
      skipCache?: boolean;
    } = {},
  ): Promise<{ data: T; nextUrl?: string }> {
    const url = new URL(`${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);

    // Masquerade as user if specified (critique §3.1, §4.4)
    if (params.asUserId) {
      url.searchParams.set('as_user_id', params.asUserId);
    }

    // Append query parameters
    if (params.query) {
      for (const [key, value] of Object.entries(params.query)) {
        if (Array.isArray(value)) {
          const paramKey = key.endsWith('[]') ? key : `${key}[]`;
          for (const item of value) {
            url.searchParams.append(paramKey, String(item));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const cacheKey = url.toString();

    if (!params.skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { data: cached.data as T, nextUrl: cached.nextUrl };
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers,
    });

    // Inspect rate-limit headers
    const remainingHeader = response.headers.get('X-Rate-Limit-Remaining');
    if (remainingHeader) {
      this.remainingCost = parseFloat(remainingHeader);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Canvas API Error [${response.status} ${response.statusText}]: ${errorText}`);
    }

    // Parse Link header for pagination (critique §3.2)
    const linkHeader = response.headers.get('Link');
    let nextUrl: string | undefined;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        nextUrl = match[1];
      }
    }

    const data = (await response.json()) as T;

    // Cache successful GET responses (including Link pagination nextUrl)
    if (!params.skipCache && this.cacheTtlMs > 0) {
      this.cache.set(cacheKey, {
        data,
        nextUrl,
        expiresAt: Date.now() + this.cacheTtlMs,
      });
    }

    return { data, nextUrl };
  }

  /**
   * Fetches all pages of a paginated Canvas endpoint.
   */
  async getAllPages<T>(
    endpoint: string,
    params: {
      asUserId?: string;
      query?: Record<string, string | number | boolean | string[]>;
      maxPages?: number;
    } = {},
  ): Promise<T[]> {
    const maxPages = params.maxPages ?? 10;
    const allItems: T[] = [];
    let currentEndpoint = endpoint;
    let pageCount = 0;

    while (currentEndpoint && pageCount < maxPages) {
      pageCount++;
      const res = await this.get<T[] | T>(currentEndpoint, {
        asUserId: params.asUserId,
        query: pageCount === 1 ? params.query : undefined,
      });

      if (Array.isArray(res.data)) {
        allItems.push(...res.data);
      } else {
        allItems.push(res.data);
      }

      if (res.nextUrl) {
        // Strip base URL to get endpoint path
        currentEndpoint = res.nextUrl.replace(this.baseUrl, '');
      } else {
        break;
      }
    }

    return allItems;
  }
}
