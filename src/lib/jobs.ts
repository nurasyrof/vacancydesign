import type { Job } from '../types/job';

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

function tagApplyUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'vacancy.design');
    u.searchParams.set('utm_medium', 'job_board');
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchTweetData(tweetUrl: string): Promise<{ text: string; handle: string }> {
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`
    );
    if (!res.ok) return { text: '', handle: '' };
    const data = await res.json() as { author_url?: string; html?: string };

    const handle = data.author_url?.split('/').filter(Boolean).pop() ?? '';

    const pMatch = data.html?.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    let text = pMatch?.[1] ?? '';
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
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
    tweetUrl: row.tweetUrl?.trim() ?? '',
    tweetVerified: row.tweetVerified?.trim().toUpperCase() === 'TRUE',
    tweetText: '',
    tweetHandle: '',
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
      if (job.tweetUrl) {
        const { text, handle } = await fetchTweetData(job.tweetUrl);
        job.tweetText = text;
        job.tweetHandle = handle;
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
