import type React from 'react';
import Link from 'next/link';
import { Instagram, Linkedin, Mail, Music2, Youtube } from 'lucide-react';
import { XLogo } from '@/components/XLogo';

/** Any icon that takes a className: the lucide set and the hand-rolled X mark
    both satisfy it, and the map does not care which it is holding. */
type PlatformIcon = React.ComponentType<{ className?: string }>;
import { getDb } from '@/lib/data';
import {
  audienceGrowth,
  audienceSeries,
  audienceTotal,
  buildSocialDashboard,
  dmGrowth,
  dmThreads,
  totalDms,
  PLATFORM_LABELS,
} from '@/lib/social';
import { syncFromZernioLive } from '@/lib/social-live';
import { zernioRecentPosts, zernioPostDaysKnown } from '@/lib/connectors/zernio';
import { buildEmailList } from '@/lib/email-list';
import type { SocialPlatform } from '@/lib/schemas';
import { Slab, SlabTitle, SlabCard, BigStat, Chip, MeterStack, InsightCard, PILL, PILL_ACCENT } from '@/components/slab';
import { StepLine, DotMatrix } from '@/components/slab-charts';
import { socialVolume } from '@/lib/social-volume';
import { formatFollowers, formatPct } from '@/components/SocialStats';
import { SocialStatStrip } from '@/components/SocialStatStrip';
import { AudienceConsistencyLazy } from '@/components/AudienceConsistencyLazy';
import { AudiencePie } from '@/components/AudiencePie';
import { PostComposer } from '@/components/PostComposer';
import { CountUp } from '@/components/CountUp';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

const PLATFORM_ICONS: Record<SocialPlatform, PlatformIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  twitter: XLogo,
  youtube: Youtube,
  linkedin: Linkedin,
};

// Human label for a raw Zernio platform string (falls back to capitalising it).
function platformLabel(platform: string): string {
  return (PLATFORM_LABELS as Record<string, string>)[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** Recency grade for a post box: one dot per post in the set, lit count =
 * how recent (all lit = newest, one lit = oldest). */
function RecencyDots({ rank, of }: { rank: number; of: number }) {
  const lit = of - rank;
  return (
    <div className="mt-1.5 flex items-center gap-1" title={`#${rank + 1} most recent of ${of}`}>
      {Array.from({ length: of }, (_, d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: d < lit ? 'var(--accent)' : 'var(--surface-3)',
            opacity: d < lit ? 0.45 + 0.55 * (lit / of) : 1,
          }}
        />
      ))}
    </div>
  );
}

// Relative "2h"/"3d" from a published-at ISO timestamp (server-rendered).
function agoFrom(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default async function SocialPage() {
  const db = getDb();
  // Live follower-count sync from Zernio/Late (falls back to static config when
  // the API is unreachable). This makes every figure on the page real-time.
  await syncFromZernioLive(db);
  // Beehiiv is snapshotted by the analytics heartbeat (every 15 min, launchd),
  // not here: collecting on render made the series a record of when this tab
  // was opened rather than of the list (BEN-659). This page only reads.

  const dash = buildSocialDashboard(db);
  const email = buildEmailList(db);
  // The platform actually leading 7-day growth (real snapshots, null-safe);
  // names the Audience growth card's sub-line, like the mock's "TikTok leads".
  const growthLeader = dash.platforms
    .filter((p) => p.growth.d7 != null)
    .reduce<{ name: string; pct: number } | null>((best, p) => {
      const pct = p.growth.d7 as number;
      return best && best.pct >= pct ? best : { name: platformLabel(p.platform), pct };
    }, null)?.name ?? null;
  const posts = db.socialPosts.all();

  // Real published posts from Zernio/Late. No sample captions when the live
  // history is empty — the card stays empty until a real post lands.
  const livePosts = await zernioRecentPosts(5);
  const recentLive = livePosts.length > 0;

  const total = audienceTotal(db);
  const queued = posts.filter((p) => p.status === 'queued').length;
  const dmInbox = dmThreads(db); // Instagram DM inbox (seeded → live via ManyChat webhook)

  // Combined-audience series + REAL per-platform posting history (from Zernio/
  // Late) for the interactive left-column charts. `today` is computed server-side
  // and passed down so the chart's date axis can't drift between server/client.
  const audiencePoints = audienceSeries(db).all.points;
  // null = Zernio gave no answer: the history is unknown, never "nothing posted".
  const knownDays = await zernioPostDaysKnown().catch(() => null);
  const postsKnown = knownDays !== null;
  const postDays = knownDays ?? [];
  const today = new Date().toISOString().slice(0, 10);

  // The Brand Deals slab's numbers (2026-09-24), all from the rows above.
  const audienceGrowthNow = audienceGrowth(db);
  const v = socialVolume({
    channels: [
      ...dash.platforms.map((p) => ({ key: p.platform, label: PLATFORM_LABELS[p.platform], value: p.followers })),
      { key: 'email', label: 'Email list', value: email.subscribers },
    ],
    total,
    growth7: audienceGrowthNow.d7,
    leader: growthLeader,
    dmThreads: dmInbox.map((t) => ({ name: t.name, unreplied: t.unreplied })),
    queued,
    postDays,
    today,
  });
  const topPlatform = v.mix.reduce((best, m) => (m.count > best.count ? m : best), v.mix[0]);

  return (
    <Slab>
      <SlabTitle
        eyebrow="audience"
        title="Social"
        meta={`${formatFollowers(total)} reach · ${postsKnown ? v.postsInWindow : '?'} posts in 30 days · ${queued} queued · ${dmInbox.length} DM threads`}
        right={
          <>
            <Chip tone="ok">zernio live</Chip>
            <Link href="/social/beehiiv" className={PILL}>
              Beehiiv
            </Link>
            <Link href="/agents" className={PILL_ACCENT}>
              Social agent
            </Link>
          </>
        }
      />

      {/* Hero row, Brand Deals' shape: every account + the volume card.
          Every account stays on the first screen; click through for detail. */}
      <div className="grid grid-cols-[2fr_1fr] gap-6 max-[1200px]:grid-cols-1">
        <SlabCard i={1} title="Accounts" sub={`${formatFollowers(total)} total`}>
      <div className="grid grid-cols-2 gap-3 px-6 pb-6 pt-4 sm:grid-cols-3">
        {dash.platforms.map((p, i) => {
          const Icon = PLATFORM_ICONS[p.platform];
          const share = total > 0 && p.followers != null ? (p.followers / total) * 100 : 0;
          return (
            <Link
              key={p.platform}
              href={`/social/${p.platform}`}
              title={`${share.toFixed(0)}% of reach`}
              data-lens="r"
              className="pressable is-row rise group rounded-[10px] border border-os-border bg-os-bg px-4 py-4"
              style={{ '--rise-i': i } as React.CSSProperties}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-os-text" />
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">
                  {PLATFORM_LABELS[p.platform]}
                </span>
                <span
                  className={`ml-auto shrink-0 font-mono text-[10px] ${
                    p.growth.d7 == null ? 'text-os-dim' : p.growth.d7 >= 0 ? 'text-os-ok' : 'text-os-err'
                  }`}
                  title="7-day growth"
                >
                  {formatPct(p.growth.d7)}
                </span>
              </div>
              <div className="mt-3 font-mono text-[26px] font-semibold leading-none tracking-[-0.02em]">
                {p.followers == null ? formatFollowers(null) : <CountUp value={p.followers} kind="followers" />}
              </div>
              <div className="mt-1.5 truncate font-mono text-[9.5px] text-os-dim">{p.handle}</div>
              <div className="mt-3 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
                <div className="fill h-full bg-os-accent opacity-60" style={{ width: `${share}%` }} />
              </div>
            </Link>
          );
        })}

        {/* Email list  -  same cell, Beehiiv-backed; opens the Beehiiv dashboard */}
        <Link
          href="/social/beehiiv"
          title={`${total > 0 && email.subscribers != null ? ((email.subscribers / total) * 100).toFixed(0) : 0}% of reach · open Beehiiv analytics`}
          data-lens="r"
          className="pressable is-row rise rounded-[10px] border border-os-border bg-os-bg px-4 py-4"
          style={{ '--rise-i': dash.platforms.length } as React.CSSProperties}
        >
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-os-accent" />
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">Email list</span>
            <span
              className={`ml-auto shrink-0 font-mono text-[10px] ${
                email.growth.d7 == null ? 'text-os-dim' : email.growth.d7 >= 0 ? 'text-os-ok' : 'text-os-err'
              }`}
              title="7-day growth"
            >
              {formatPct(email.growth.d7)}
            </span>
          </div>
          <div className="mt-3 font-mono text-[26px] font-semibold leading-none tracking-[-0.02em]">
            {email.subscribers == null ? formatFollowers(null) : <CountUp value={email.subscribers} kind="followers" />}
          </div>
          <div className="mt-1.5 truncate font-mono text-[9.5px] text-os-dim">Beehiiv · Newsletter</div>
          <div className="mt-3 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
            <div
              className="fill h-full bg-os-accent opacity-60"
              style={{ width: `${total > 0 && email.subscribers != null ? (email.subscribers / total) * 100 : 0}%` }}
            />
          </div>
        </Link>
      </div>
        </SlabCard>

        <SlabCard i={2} title="Audience Volume" className="flex flex-col">
          <div className="flex flex-1 flex-col px-6 pb-6 pt-3">
            <BigStat value={v.headline} kind="followers" chips={v.chips} caption={v.caption} />
            <MeterStack meters={v.meters} foot={v.foot} empty="no channel is reporting followers yet" />
          </div>
        </SlabCard>
      </div>

      {/* Second row: posting line, platform mix, THE gradient card */}
      <div className="mb-6 mt-6 grid grid-cols-3 gap-6 max-[1200px]:grid-cols-1">
        <SlabCard i={3} title="Posting Activity" sub="last 30 days">
          <div className="px-6 pt-3">
            <BigStat
              size={30}
              value={v.postsInWindow}
              display={postsKnown ? undefined : ' - '}
              caption={postsKnown ? 'posts out through Zernio' : 'Zernio not answering · posting history unknown'}
            />
          </div>
          <StepLine
            series={v.series}
            hue="var(--send-activity)"
            unit=" posts"
            empty={postsKnown ? 'No posts in the last 30 days.' : 'Posting history unavailable right now.'}
          />
        </SlabCard>

        <SlabCard i={4} title="Platform Mix" sub="posts per platform">
          <div className="flex items-end justify-between gap-4 px-6 pb-6 pt-3">
            <BigStat
              size={30}
              display={topPlatform.count > 0 ? topPlatform.label : postsKnown ? 'none' : ' - '}
              caption={topPlatform.count > 0 ? `most posted · ${topPlatform.count} posts` : postsKnown ? 'nothing posted in 30 days' : 'posting history unknown'}
            />
            <DotMatrix cols={v.mix} hue="var(--ramp-1)" />
          </div>
        </SlabCard>

        <InsightCard
          i={5}
          badge="Needs reply"
          value={v.insight.value}
          headline={v.insight.headline}
          body={v.insight.body}
          frac={v.insight.frac}
        />
      </div>

      {/* Summary strip  -  Total reach + Audience-growth + Total-DMs interactive
          tiles, and the Instagram DMs tile (click to open the inbox and reply).
          The old "Top platform" tile was retired as a dead metric. */}
      <Rise i={6}>
      <SocialStatStrip
        growthLeader={growthLeader}
        audienceTotal={total}
        audienceGrowth={audienceGrowthNow}
        totalDms={totalDms(db)}
        dmGrowth={dmGrowth(db)}
        platformsCount={dash.platforms.length}
        dmThreads={dmInbox}
        nowMs={Date.now()}
      />
      </Rise>

      {/* Charts left, audience-share pie riding the right of the same card;
          Recent posts live underneath as a row of boxes. */}
      <Rise i={7} className="mb-6">
        <AudienceConsistencyLazy
          audience={audiencePoints}
          postDays={postDays}
          today={today}
          aside={
            <AudiencePie
              framed={false}
              stacked
              donutPx={172}
              items={[
                ...dash.platforms.map((p) => ({
                  key: p.platform,
                  label: PLATFORM_LABELS[p.platform],
                  value: p.followers,
                })),
                { key: 'email', label: 'Email list', value: email.subscribers },
              ]}
              total={total}
            />
          }
        />
      </Rise>

      {/* Recent posts  -  box row, newest first; the dot strip grades recency
          (all dots lit = most recent, fading down to the oldest). */}
      <SlabCard
        i={8}
        title="Recent posts"
        sub={recentLive ? `${livePosts.length} live · zernio` : 'waiting on zernio'}
      >
        <div className="grid gap-3 px-6 pb-6 pt-4 sm:grid-cols-2 xl:grid-cols-5">
          {recentLive ? (
            livePosts.map((p, i) => (
                <div
                  key={`${p.url}-${i}`}
                  data-lens="r" className="pressable is-row flex flex-col rounded-[10px] border border-os-border bg-os-bg px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-accent">
                      {platformLabel(p.platform)}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-os-dim">{agoFrom(p.publishedAt)}</span>
                  </div>
                  <RecencyDots rank={i} of={livePosts.length} />
                  <div className="mt-2 line-clamp-3 text-[12px] [text-wrap:pretty]">{p.caption.split('\n')[0]}</div>
                  <div className="mt-auto flex items-center gap-1.5 pt-2 font-mono text-[10px] text-os-dim">
                    <span className={p.status === 'success' ? 'text-os-ok' : 'text-os-warn'}>{p.status}</span>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto rounded-sm-t border border-os-border px-1.5 py-0.5 text-os-accent hover:border-os-border-strong"
                      >
                        view →
                      </a>
                    )}
                  </div>
                </div>
              ))
          ) : (
            <p className="col-span-full font-mono text-[12px] text-os-dim">No published posts from Zernio yet.</p>
          )}
        </div>
      </SlabCard>

      {/* Publish  -  compose a post that queues for the Social agent */}
      <SlabCard
        i={9}
        title="Publish"
        sub={`${queued} queued`}
        className="mt-6"
        action={
          <Link href="/agents" className={PILL}>
            Social agent
          </Link>
        }
      >
        <div className="px-6 pb-6 pt-4">
          <PostComposer initialPosts={posts} />
        </div>
      </SlabCard>
    </Slab>
  );
}
