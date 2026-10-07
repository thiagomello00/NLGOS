/**
 * NLG Agency acquisition taxonomy — first-touch HighLevel attribution.
 * FounderOS radial wedges (YouTube / newsletter / word of mouth) stay in
 * funnel-radial.ts for non-GHL journeys.
 */
export const NLG_ACQUISITIONS = [
  { id: 'instagram_meta', label: 'Instagram / Meta Ads' },
  { id: 'direct', label: 'Direct' },
  { id: 'organic', label: 'Organic' },
  { id: 'referral', label: 'Referral' },
  { id: 'other', label: 'Other' },
  { id: 'unknown', label: 'Unknown' },
] as const;

export type NlgAcquisition = (typeof NLG_ACQUISITIONS)[number]['id'];

export type GhlAttributionFields = {
  isFirst?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmSessionSource?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  medium?: string;
  mediumId?: string;
};

export type NlgAttribution = {
  category: NlgAcquisition;
  firstTouchSource: string | null;
  campaign: string | null;
  content: string | null;
  opportunitySource: string | null;
  sessionSource: string | null;
  utmMedium: string | null;
  medium: string | null;
};

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;
const PLACEHOLDER = /^\{\{.*\}\}$/;

function usable(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || TIMESTAMP.test(s) || PLACEHOLDER.test(s)) return null;
  return s;
}

function lower(raw: string | undefined | null): string {
  return (usable(raw) ?? '').toLowerCase();
}

export function firstTouchAttribution(attrs: GhlAttributionFields[] | undefined): GhlAttributionFields | null {
  if (!attrs?.length) return null;
  return attrs.find((a) => a.isFirst === true) ?? null;
}

function hasMetaEvidence(first: GhlAttributionFields | null, source: string | null): boolean {
  const utmSource = lower(first?.utmSource);
  const utmMedium = lower(first?.utmMedium);
  const medium = lower(first?.medium);
  const session = lower(first?.utmSessionSource);
  const src = lower(source);

  if (
    /instagram|facebook/.test(utmSource) ||
    /^(ig|fb)$/.test(utmSource) ||
    /instagram[_-]|facebook[_-]/.test(utmSource)
  ) {
    return true;
  }
  if (utmMedium === 'ig' || utmMedium === 'fb') return true;
  if (utmMedium === 'paid') return true;
  if (medium === 'instagram' || medium === 'facebook') return true;
  if (session === 'paid social') return true;
  if (/^(ig dms?|ig dm|ig|facebook|ads)$/.test(src)) return true;
  return false;
}

function classify(first: GhlAttributionFields | null, source: string | null): NlgAcquisition {
  if (hasMetaEvidence(first, source)) return 'instagram_meta';
  const session = lower(first?.utmSessionSource);
  const src = lower(source);
  if (session === 'direct traffic' || src === 'direct traffic') return 'direct';
  if (session === 'organic search' || /\borganic\b/.test(src)) return 'organic';
  if (session === 'referral' || /referr/.test(src) || /word of mouth/.test(src)) return 'referral';
  if (first || source) return 'other';
  return 'unknown';
}

/** Map a HighLevel opportunity's first-touch fields onto the NLG taxonomy. */
export function nlgAttributionFromGhl(input: {
  source?: string | null;
  attributions?: GhlAttributionFields[] | undefined;
}): NlgAttribution {
  const opportunitySource = usable(input.source ?? null);
  const first = firstTouchAttribution(input.attributions);
  const category = classify(first, opportunitySource);
  return {
    category,
    firstTouchSource: usable(first?.utmSource) ?? (first ? usable(first.medium) : null) ?? opportunitySource,
    campaign: usable(first?.utmCampaign),
    content: usable(first?.utmContent),
    opportunitySource,
    sessionSource: usable(first?.utmSessionSource),
    utmMedium: usable(first?.utmMedium),
    medium: usable(first?.medium),
  };
}

export function nlgAcquisitionLabel(id: NlgAcquisition): string {
  return NLG_ACQUISITIONS.find((a) => a.id === id)?.label ?? 'Unknown';
}
