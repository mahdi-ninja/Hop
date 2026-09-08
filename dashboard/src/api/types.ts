export interface ApiLink {
  slug: string;
  shortUrl: string;
  url: string;
  title: string | null;
  visitCount: number;
  createdAt: number;
  createdBy: string | null;
  updatedAt: number;
  updatedBy: string | null;
}

export interface LinkPage {
  items: ApiLink[];
  nextCursor: string | null;
}

export type RangeName = '7d' | '30d' | '90d' | 'all';

export interface Range {
  from: number;
  to: number;
}

export interface DayCount {
  day: string;
  visits: number;
}

export interface KeyCount {
  key: string;
  visits: number;
}

export interface LinkStats {
  range: Range;
  total: number;
  perDay: DayCount[];
  countries: KeyCount[];
  referrers: KeyCount[];
  devices: KeyCount[];
  browsers: KeyCount[];
  os: KeyCount[];
}

export interface Visit {
  ts: number;
  country: string | null;
  city: string | null;
  referrerHost: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  isBot: boolean;
}

export interface Overview {
  range: Range;
  totalLinks: number;
  totalVisits: number;
  perDay: DayCount[];
  topLinks: { slug: string; title: string | null; visits: number }[];
}
