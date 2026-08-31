export interface Link {
  slug: string;
  url: string;
  title: string | null;
  visitCount: number;
  createdAt: number;
  createdBy: string | null;
  updatedAt: number;
  updatedBy: string | null;
}

export type Device = 'desktop' | 'mobile' | 'tablet' | 'other';

export interface NewVisit {
  slug: string;
  ts: number;
  country: string | null;
  region: string | null;
  city: string | null;
  referrerHost: string | null;
  device: Device;
  browser: string | null;
  os: string | null;
  isBot: boolean;
}

export interface Visit {
  ts: number;
  country: string | null;
  city: string | null;
  referrerHost: string | null;
  device: Device | null;
  browser: string | null;
  os: string | null;
  isBot: boolean;
}

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

export interface TopLink {
  slug: string;
  title: string | null;
  visits: number;
}

export interface Overview {
  range: Range;
  totalLinks: number;
  totalVisits: number;
  perDay: DayCount[];
  topLinks: TopLink[];
}

export interface Identity {
  email: string;
}

export interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

export interface Config {
  shortDomain: string;
  rootRedirectUrl: string | null;
}
