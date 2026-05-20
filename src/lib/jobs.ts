import type { Job, PostType } from '../types/job';

const CSV_URL = import.meta.env.GOOGLE_SHEETS_CSV_URL as string;

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'bullets'; items: string[] };

export function parseBlocks(raw: string): Block[] {
  const segments = raw.split(/\||\n/).map(s => s.trim()).filter(Boolean);
  const blocks: Block[] = [];

  for (const seg of segments) {
    if (seg.startsWith('## ')) {
      blocks.push({ type: 'heading', text: seg.slice(3) });
    } else if (seg.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'bullets') {
        last.items.push(seg.slice(2));
      } else {
        blocks.push({ type: 'bullets', items: [seg.slice(2)] });
      }
    } else {
      blocks.push({ type: 'paragraph', text: seg });
    }
  }

  return blocks;
}

const SOCIAL_HOSTS = new Set(['x.com', 'twitter.com', 'threads.com', 'threads.net']);

function extractHandleFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return (parts[0] ?? '').replace(/^@/, '');
  } catch {
    return '';
  }
}

function detectPostType(url: string): PostType {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (hostname === 'x.com' || hostname === 'twitter.com') return 'twitter';
    if (hostname === 'threads.com' || hostname === 'threads.net') return 'threads';
    return '';
  } catch {
    return '';
  }
}

function tagApplyUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (SOCIAL_HOSTS.has(u.hostname.replace(/^www\./, ''))) return url;
    u.searchParams.set('utm_source', 'vacancy.design');
    u.searchParams.set('utm_medium', 'job_board');
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchPostData(url: string, type: PostType): Promise<{ text: string; handle: string }> {
  const oembedBase = type === 'twitter'
    ? 'https://publish.twitter.com/oembed'
    : 'https://www.threads.net/oembed/';

  try {
    const res = await fetch(`${oembedBase}?url=${encodeURIComponent(url)}&omit_script=true`);
    if (!res.ok) return { text: '', handle: '' };
    const data = await res.json() as { author_url?: string; html?: string };

    const rawHandle = data.author_url?.split('/').filter(Boolean).pop() ?? '';
    const handle = rawHandle.replace(/^@/, '');

    const html = data.html ?? '';
    let textSource = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';

    // Threads fallback: extract all text from inside the blockquote
    if (!textSource && type === 'threads') {
      textSource = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/)?.[1] ?? '';
    }

    let text = textSource
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/pic\.twitter\.com\/\S+/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text, handle };
  } catch {
    return { text: '', handle: '' };
  }
}

function parseCsvRow(row: Record<string, string>): Job {
  return {
    id: row.id?.trim() ?? '',
    companyName: row.companyName?.trim() ?? '',
    roleTitle: row.roleTitle?.trim() ?? '',
    city: row.city?.trim() ?? '',
    country: row.country?.trim() ?? '',
    employmentType: row.employmentType?.trim() ?? '',
    summary: row.summary?.trim() ?? '',
    responsibilities: (row.responsibilities ?? '').split('|').map(s => s.trim()).filter(Boolean),
    requirements: (row.requirements ?? '').split('|').map(s => s.trim()).filter(Boolean),
    applyUrl: tagApplyUrl(row.applyUrl?.trim() ?? ''),
    postedDate: row.postedDate?.trim() ?? '',
    expiryDate: row.expiryDate?.trim() ?? '',
    active: row.active?.trim().toUpperCase() === 'TRUE',
    isBoosted: row.isBoosted?.trim().toUpperCase() === 'TRUE',
    logoUrl: row.logoUrl?.trim() ?? '',
    postVerified: row.postVerified?.trim().toUpperCase() === 'TRUE',
    postType: '',
    postText: '',
    postHandle: '',
  };
}

function isActive(job: Job): boolean {
  if (!job.expiryDate) return true;
  return new Date(job.expiryDate) >= new Date(new Date().toDateString());
}

export async function getJobs(): Promise<Job[]> {
  const { default: Papa } = await import('papaparse');

  const res = await fetch(CSV_URL);
  const text = await res.text();

  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const jobs = data.map(parseCsvRow).filter(j => j.id && j.active && isActive(j));

  const boosted = jobs.filter(j => j.isBoosted).sort(byDate);
  const regular = jobs.filter(j => !j.isBoosted).sort(byDate);
  const sorted = [...boosted, ...regular];

  await Promise.all(
    sorted.map(async job => {
      const postType = detectPostType(job.applyUrl);
      if (postType) {
        const { text, handle } = await fetchPostData(job.applyUrl, postType);
        job.postType = postType;
        job.postText = text;
        job.postHandle = handle || extractHandleFromUrl(job.applyUrl);
      }
    })
  );

  return sorted;
}

function byDate(a: Job, b: Job): number {
  return new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime();
}

export function locationLabel(job: Job): string {
  if (job.city === 'Remote' || job.country === 'Remote') return 'Remote';
  return [job.city, job.country].filter(Boolean).join(', ');
}
