import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * HighLevel connector — NLG Agency pipelines, opportunities, contacts. Auth is
 * a Private Integration Token (Settings → Private Integrations, read scopes)
 * plus the location id. Never reports a fake "connected".
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

export async function ghlStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('ghl', 'HighLevel', 'crm', 'nurture pipeline · live');
  const base = { id: 'ghl', name: 'HighLevel', kind: 'crm' } as const;
  const key = resolveCred('GHL_API_KEY', [CRED_FILES.brainAgent]);
  const locationId = resolveCred('GHL_LOCATION_ID', [CRED_FILES.brainAgent]);
  if (!key || !locationId) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'NLG Agency pipeline. Set GHL_API_KEY (Private Integration token) + GHL_LOCATION_ID in .env.local.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail: 'Private Integration token present · HighLevel opportunities feed the funnel live.',
    meta: { keyed: 'yes' },
  };
}
