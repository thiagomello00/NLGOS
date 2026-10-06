import type { Agent } from '@/lib/schemas';

/**
 * The content-creation crew: Content, Production, and Post Production.
 * The lead comes first, then the workers alphabetically.
 */
export const CONTENT_DEPT_IDS = ['dept-content', 'dept-production', 'dept-post-production'] as const;

export function contentAgents(agents: Agent[]): Agent[] {
  const isLead = (a: Agent) => (a.tier === 'lead' || a.parentId === null ? 0 : 1);
  return agents
    .filter((a) => (CONTENT_DEPT_IDS as readonly string[]).includes(a.departmentId))
    .sort((a, b) => isLead(a) - isLead(b) || a.name.localeCompare(b.name));
}
