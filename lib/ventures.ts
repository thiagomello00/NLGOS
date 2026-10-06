/**
 * NLG Agency — one company, one sales pipeline.
 *
 * One database, one G-Brain, one agent roster. The venture lens is a saved
 * filter over that shared graph, not a second CRM.
 */
import type { LifeArea } from '@/lib/life-map';
import { LIFE_AREAS } from '@/lib/life-map';

export type Venture = {
  id: string;
  label: string;
  kind: string;
  color: string;
  detail: string;
  brainTag: string;
  focus: string[];
  areaAgents: Record<string, string[]>;
};

const SHARED_OPS = ['conductor', 'stack-monitor'];
const SHARED_KNOWLEDGE = ['data-agent', 'markdown-auditor', 'vector-auditor'];

export const VENTURES: Venture[] = [
  {
    id: 'nlg',
    label: 'NLG Agency',
    kind: 'Creative agency',
    color: '#c8c8c8',
    detail: 'NLG Agency — one HighLevel sales pipeline.',
    brainTag: 'nlg',
    focus: [
      'HighLevel pipeline is the sales source of truth (once connected)',
      'Client delivery across Content, Production, Post, and Paid Media',
      'Honest empty states until live connectors provide numbers',
    ],
    areaAgents: {
      marketing: ['social-agent', 'postly-publisher', 'adsmith-creative', 'reelkit-editor', 'renderly-creative', 'dmflow-mcp'],
      sales: ['sales-agent', 'crm-pulse', 'sales-calls-data', 'vantage-sales', 'launchpad-cohort-sales'],
      communication: ['comms-agent', 'gmail-worker', 'whatsapp-worker', 'slack-worker', 'crm-pulse'],
      finances: ['payments-pulse', 'stripe-sales', 'processor-confirmation'],
      knowledge: [...SHARED_KNOWLEDGE],
      operations: SHARED_OPS,
      clients: ['client-roster', 'client-onboarding', 'client-success'],
    },
  },
];

export function getVenture(id: string): Venture | null {
  return VENTURES.find((v) => v.id === id) ?? null;
}

export function ventureAgentSet(ventureId: string): Set<string> {
  const v = getVenture(ventureId);
  return new Set(v ? Object.values(v.areaAgents).flat() : []);
}

export function venturesForAgent(agentId: string): Venture[] {
  return VENTURES.filter((v) => ventureAgentSet(v.id).has(agentId));
}

export function ventureAreaAgents(ventureId: string, areaId: string): string[] {
  return getVenture(ventureId)?.areaAgents[areaId] ?? [];
}

export function lifeAreaById(areaId: string): LifeArea | null {
  return LIFE_AREAS.find((a) => a.id === areaId) ?? null;
}
