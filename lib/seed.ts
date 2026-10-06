import type { FounderDb } from '@/lib/db';
import { PERSONAS } from '@/lib/personas-seed';
import { runCostUsd } from '@/lib/agent-costs';
import type {
  AgentCron,
  Agent,
  AgentRun,
  AgentTask,
  Department,
  Domain,
  EmailListSnapshot,
  FunnelContact,
  FunnelTouch,
  Metric,
  Person,
  Phase,
  RoadmapItem,
  SopTask,
  Workflow,
  Skill,
  SocialAccount,
  SocialDm,
  SocialDmSnapshot,
  SocialDmMessage,
  SocialPost,
  SocialSnapshot,
  Tool,
  LeadMagnet,
  Proposal,
} from '@/lib/schemas';

// Monochrome palette — the UI is strict black & white; "color" fields carry
// grayscale steps used only for subtle hierarchy.
const GRAY = {
  white: '#fafafa',
  light: '#d4d4d4',
  mid: '#a3a3a3',
  dim: '#737373',
  dark: '#525252',
};

// NLG Agency operating departments.
const departments: Department[] = [
  { id: 'dept-leadership', name: 'Leadership', slug: 'leadership', tagline: 'Co-founders and OS command.', color: GRAY.white, order: 1 },
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'HighLevel pipeline and deals.', color: GRAY.light, order: 2 },
  { id: 'dept-client-success', name: 'Client Success', slug: 'client-success', tagline: 'Onboarding, service, and comms.', color: GRAY.mid, order: 3 },
  { id: 'dept-content', name: 'Content', slug: 'content', tagline: 'Scripts, editorial, owned content.', color: GRAY.dim, order: 4 },
  { id: 'dept-production', name: 'Production', slug: 'production', tagline: 'Shoot and creative generation.', color: GRAY.dark, order: 5 },
  { id: 'dept-post-production', name: 'Post Production', slug: 'post-production', tagline: 'Edit, captions, delivery cuts.', color: GRAY.light, order: 6 },
  { id: 'dept-paid-media', name: 'Paid Media', slug: 'paid-media', tagline: 'Ads and paid acquisition.', color: GRAY.mid, order: 7 },
  { id: 'dept-finance', name: 'Finance & Admin', slug: 'finance-admin', tagline: 'Processors, books, admin.', color: GRAY.dim, order: 8 },
  { id: 'dept-growth', name: 'Growth / NLG Brand', slug: 'growth', tagline: 'NLG brand, publishing, DMs.', color: GRAY.dark, order: 9 },
];

// The roster IS the runtime — every row here maps 1:1 to a RuntimeAgent in
// lib/agents/real.ts (enforced by tests/seed.test.ts). No demo agents.
//
// Shape: top-level agents (parentId null) are INSTANCE slots — each one is
// what becomes its own Clawline / Claude Code process on a dedicated host
// (`instance` records that binding; everything is 'builtin' until then).
// Worker rows underneath them do one specific task each and sit at the
// bottom of the hierarchy.
const agents: Agent[] = [
  // ── TECH: AI head ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'conductor',
    departmentId: 'dept-leadership',
    name: 'Conductor',
    role: 'Broadcast & Orchestration',
    status: 'active',
    tier: 'lead',
    description: 'Fans your message out to every agent at once and checks which instance hosts (Clawline, Ollama, tmux) are available for future bindings.',
    model: 'fan-out runtime',
    tools: ['broadcast', 'clawline', 'tmux'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Communications: one instance, three channel workers feeding /comms ────────
  {
    id: 'comms-digest',
    departmentId: 'dept-client-success',
    name: 'Comms Digest',
    role: 'Morning Report · 09:00 daily',
    status: 'active',
    tier: 'lead',
    description:
      'Scrapes the last 24h across configured inboxes, WhatsApp and Slack and ranks who needs a reply. Also lists what to unsubscribe from.',
    model: 'rules + connectors',
    tools: ['comms-feed', 'calendar', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'comms-agent',
    departmentId: 'dept-client-success',
    name: 'Comms Agent',
    role: 'Unified Communications Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the unified /comms feed. Aggregates its three channel workers and reports which are live.',
    model: 'aggregate of workers',
    tools: ['comms-feed'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'gmail-worker',
    departmentId: 'dept-client-success',
    name: 'Gmail Worker',
    role: 'IMAP Inboxes ×4',
    status: 'planned',
    tier: 'worker',
    description: 'Pulls unread counts and recent mail from up to four IMAP inboxes into /comms. Activates when INBOX_* creds land.',
    model: 'imapflow',
    tools: ['imap'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'whatsapp-worker',
    departmentId: 'dept-client-success',
    name: 'WhatsApp Worker',
    role: 'Chat Monitor',
    status: 'active',
    tier: 'worker',
    description: 'Reads the local WhatsApp ChatStorage (local team chats) into /comms. Works today.',
    model: 'local sqlite (read-only)',
    tools: ['whatsapp'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'slack-worker',
    departmentId: 'dept-client-success',
    name: 'Slack Worker',
    role: 'Channel Digest',
    status: 'planned',
    tier: 'worker',
    description: 'Latest messages across joined channels into /comms. Needs SLACK_BOT_TOKEN.',
    model: '@slack/web-api',
    tools: ['slack'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  // ── Marketing/Growth: social/content crew ───────────────────────────
  {
    id: 'social-agent',
    departmentId: 'dept-growth',
    name: 'Social Agent',
    role: 'Social Media & Content Creation Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns publishing and content production. Aggregates the Postly and Adsmith workers.',
    model: 'aggregate of workers',
    tools: ['postly', 'adsmith', 'reelkit', 'renderly', 'dmflow'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'brand-deal-agent',
    departmentId: 'dept-growth',
    name: 'Brand Deal Agent',
    role: 'Vera · brand deal manager',
    status: 'active',
    tier: 'worker',
    description:
      'Negotiates inbound brand deals: qualifies inbound, anchors and counters, chases unpaid invoices, and bumps stalled threads. A tested contact governor decides whether a thread may be touched at all. Drafts only, never sends.',
    model: 'rules + gateway',
    tools: ['ledger', 'imap'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'newsletter-agent',
    departmentId: 'dept-content',
    name: 'Newsletter Agent',
    role: 'Issue drafting',
    status: 'active',
    tier: 'lead',
    description:
      'Reads newsletter send performance, builds a brief that is honest about how thin the history is, and drafts the next issue against the skill file. Drafts only, never schedules or sends.',
    model: 'rules + gateway',
    tools: ['newsletter'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'postly-publisher',
    departmentId: 'dept-growth',
    name: 'Postly Publisher',
    role: 'Six-Platform Publishing',
    status: 'active',
    tier: 'worker',
    description: 'Publishes and monitors connected platforms via Postly. Live once the Postly key is set.',
    model: 'postly api',
    tools: ['postly'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'adsmith-creative',
    departmentId: 'dept-paid-media',
    name: 'Adsmith Creative',
    role: 'UGC Ad Generation',
    status: 'active',
    tier: 'worker',
    description: 'Generates UGC ads via the Adsmith API. Live once Adsmith auth is set.',
    model: 'adsmith api',
    tools: ['adsmith'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'reelkit-editor',
    departmentId: 'dept-post-production',
    name: 'Reelkit Editor',
    role: 'Social Editing Pipeline',
    status: 'active',
    tier: 'worker',
    description: 'Editing and rendering pipeline for social media clips, captions, and promotional cuts.',
    model: 'reelkit pipeline',
    tools: ['reelkit', 'whisper'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'renderly-creative',
    departmentId: 'dept-production',
    name: 'Renderly Creative',
    role: 'AI Creative Studio',
    status: 'active',
    tier: 'worker',
    description: 'Renderly creative generation for social assets, product shots, and campaign visuals.',
    model: 'renderly cli',
    tools: ['renderly'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'dmflow-mcp',
    departmentId: 'dept-growth',
    name: 'DMFlow MCP',
    role: 'DM Automation',
    // live: the MCP server is registered user-scope and the
    // connector authenticates against the real Instagram Pro account
    status: 'active',
    tier: 'worker',
    description: 'DMFlow MCP/API lane for social DM automations, keyword flows, and lead capture.',
    model: 'dmflow api',
    tools: ['dmflow'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'sales-agent',
    departmentId: 'dept-sales',
    name: 'Sales Agent',
    role: 'Deals & Pipeline Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the sales pillar. Aggregates CRM Pulse and reports the live HighLevel pipeline once connected.',
    model: 'aggregate of workers',
    tools: ['ledger', 'paykit', 'stripe', 'flexpay', 'recall', 'plaud'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'launchpad-cohort-sales',
    departmentId: 'dept-sales',
    name: 'Revenue Attribution',
    role: 'Trakyo Attribution Lane',
    status: 'planned',
    tier: 'worker',
    description: 'Revenue attribution lane: Trakyo content-to-revenue context for NLG Agency sales.',
    model: 'account lane',
    tools: ['ledger', 'stripe', 'paykit'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'vantage-sales',
    departmentId: 'dept-sales',
    name: 'Pipeline Lane',
    role: 'Account Pipeline Lane',
    status: 'planned',
    tier: 'worker',
    description: 'Agency sales lane: pipeline, payment context, and call data. Runtime id preserved.',
    model: 'account lane',
    tools: ['ledger', 'stripe', 'paykit'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'paykit-sales',
    departmentId: 'dept-finance',
    name: 'PayKit',
    role: 'Offer & Payment Platform',
    status: 'planned',
    tier: 'worker',
    description: 'PayKit sales platform connection for offers and customer/payment context.',
    model: 'paykit api',
    tools: ['paykit'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'vantage-paykit',
    departmentId: 'dept-sales',
    name: 'PayKit Lane',
    role: 'PayKit Lane',
    status: 'planned',
    tier: 'worker',
    description: 'PayKit offer, payment, and customer context. Runtime id preserved.',
    model: 'paykit api',
    tools: ['paykit'],
    parentId: 'vantage-sales',
    instance: 'builtin',
  },
  {
    id: 'stripe-sales',
    departmentId: 'dept-finance',
    name: 'Stripe',
    role: 'Sales Payment Processor',
    status: 'planned',
    tier: 'worker',
    description: 'Stripe payment confirmation lane for sales workflows and account-level revenue checks.',
    model: 'stripe sdk',
    tools: ['stripe'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'processor-confirmation',
    departmentId: 'dept-finance',
    name: 'Processor Confirm',
    role: 'Payment API Confirmation',
    status: 'planned',
    tier: 'worker',
    description: 'APIs to payment processors for confirming paid, failed, disputed, and pending states.',
    model: 'processor registry',
    tools: ['stripe', 'paypal', 'square', 'whop', 'paykit'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'flexpay-financing',
    departmentId: 'dept-finance',
    name: 'FlexPay Financing',
    role: 'Financing Options',
    status: 'planned',
    tier: 'worker',
    description: 'FlexPay financing options lane for sales offers and payment-plan context.',
    model: 'flexpay api',
    tools: ['flexpay'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'sales-calls-data',
    departmentId: 'dept-sales',
    name: 'Sales Calls Data',
    role: 'Call Intelligence',
    status: 'planned',
    tier: 'worker',
    description: 'Sales calls data lane for recordings, notes, outcomes, and follow-up context: Recall on the calls, Plaud in the room.',
    model: 'recall + plaud + crm',
    tools: ['recall', 'plaud', 'ledger'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  // ── TECH: the G-Brain data analyst and its auditors ──────────────────────────────
  {
    id: 'data-agent',
    departmentId: 'dept-leadership',
    name: 'Data Agent',
    role: 'G-Brain Analyst',
    status: 'active',
    tier: 'lead',
    description: 'Bound to the G-Brain instance: analyzes markdown + vector storage health and surfaces ideas. Answers broadcasts by querying the brain.',
    model: 'gbrain CLI',
    tools: ['gbrain', 'brain-store', 'ollama', 'supabase'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'markdown-auditor',
    departmentId: 'dept-leadership',
    name: 'Markdown Auditor',
    role: 'brain-store Health',
    status: 'active',
    tier: 'worker',
    description: 'Audits the knowledge base: broken wikilinks, orphan pages, duplicate titles, and whether the index search reads still matches the store on disk.',
    model: 'link audit',
    tools: ['brain-store'],
    parentId: 'data-agent',
    instance: 'builtin',
  },
  {
    id: 'vector-auditor',
    departmentId: 'dept-leadership',
    name: 'Vector Auditor',
    role: 'pgvector / Supabase Health',
    status: 'active',
    tier: 'worker',
    description: 'Runs gbrain doctor: connection to Supabase pgvector, embedding checks, health score. Works today.',
    model: 'gbrain doctor',
    tools: ['supabase', 'ollama'],
    parentId: 'data-agent',
    instance: 'builtin',
  },
  // ── Finances ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'payments-pulse',
    departmentId: 'dept-finance',
    name: 'Payments Pulse',
    role: 'Processor Monitor',
    status: 'planned',
    tier: 'lead',
    description: 'Stripe balance + recent charges; PayPal/Square/Whop registered and awaiting keys.',
    model: 'stripe sdk',
    tools: ['stripe', 'paypal', 'square', 'whop'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'crm-pulse',
    departmentId: 'dept-sales',
    name: 'HighLevel CRM',
    role: 'GoHighLevel Pipeline',
    status: 'active',
    tier: 'worker',
    description: 'NLG Agency deals from HighLevel (and Ledger until GHL is live).',
    model: 'ledger api',
    tools: ['ledger'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  // ── TECH: automations ─────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'stack-monitor',
    departmentId: 'dept-leadership',
    name: 'Stack Monitor',
    role: 'Local Stack Health',
    status: 'active',
    tier: 'lead',
    description: 'Reelkit, Ollama, command-center, Clawline, tmux, whisper, ffmpeg, renderly, gh + Dictate Flow stats.',
    model: 'local checks',
    tools: ['reelkit', 'ollama', 'tmux', 'dictate'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Clients: roster, onboarding, service ──────────────────────────────────
  {
    id: 'client-roster',
    departmentId: 'dept-client-success',
    name: 'Client Roster',
    role: 'Live Client List',
    status: 'active',
    tier: 'lead',
    description: 'The single source of truth for who is a client: reconciles CRM against the funnel and keeps the roster current.',
    model: 'funnel + Ledger',
    tools: ['ledger', 'paykit'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'client-onboarding',
    departmentId: 'dept-client-success',
    name: 'Onboarding Agent',
    role: 'Closed-Won to Kickoff',
    status: 'planned',
    tier: 'worker',
    description: 'Runs the onboarding SOP end to end when a deal closes: welcome pack, workspace setup, kickoff booked, handoff notes.',
    model: 'ledger + slack',
    tools: ['ledger', 'slack'],
    parentId: 'client-roster',
    instance: 'builtin',
  },
  {
    id: 'client-success',
    departmentId: 'dept-client-success',
    name: 'Client Success',
    role: 'Service & Renewals',
    status: 'planned',
    tier: 'worker',
    description: 'Keeps active clients served: check-in cadence, deliverable tracking from call notes (Recall) and in-person meeting recordings (Plaud), renewal and upsell flags.',
    model: 'recall + plaud + slack',
    tools: ['recall', 'plaud', 'slack'],
    parentId: 'client-roster',
    instance: 'builtin',
  },
];

// ── Humans in the process ─────────────────────────────────────────────────────
// Named heads plus demo-first seeds for the roles an operator hires
// into (rename when a real person lands). Tools use the agents' slug
// namespace so the graph chain still ends in tools for humans too.
const people: Person[] = [];

// ── SOP tasks — every department role's job, written out ─────────────────────
// One task per worker, one worker per task (monogamous; tests enforce it).
// The chain the /brain graph draws: department → task → worker → tools.
const leadMagnets: LeadMagnet[] = [];
const sopTasks: SopTask[] = [];


// The tool registry behind /reference and the graph. `status` is honest about
// what the host can actually reach: connected = credentials or binary present
// and working; available = implemented but waiting on a key or a running service.
const tools: Tool[] = [
  // Knowledge
  { id: 'tool-gbrain', name: 'G-Brain (gbrain CLI)', category: 'Knowledge', status: 'connected', color: GRAY.white, description: 'Markdown brain-store plus a hosted vector backend and local embeddings.' },
  { id: 'tool-brain-store', name: 'brain-store/', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local markdown knowledge base on disk.' },
  { id: 'tool-ollama', name: 'Ollama (bge-m3)', category: 'Knowledge', status: 'connected', color: GRAY.mid, description: 'Local 1024d embeddings behind gbrain hybrid search, plus the local rerank pass. No key, no vendor.' },
  { id: 'tool-supabase', name: 'Supabase (Second Brain)', category: 'Knowledge', status: 'available', color: GRAY.mid, description: 'Roughly a thousand pages of chunked knowledge. A free tier pauses on idle: unpause from the dashboard when queries fail.' },
  { id: 'tool-obsidian', name: 'Notes Vault', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local notes vault. Direct filesystem access.' },
  // Social & growth
  { id: 'tool-postly', name: 'Postly', category: 'Social', status: 'connected', color: GRAY.white, description: 'Six platforms behind one publishing account (IG, TikTok, X…). Key comes from the environment.' },
  { id: 'tool-dmflow', name: 'DMFlow', category: 'Social', status: 'connected', color: GRAY.white, description: 'DM automation, live via the standalone DMFlow MCP. Keyword flows are still authored in the DMFlow UI: the public API has no flow authoring.' },
  { id: 'tool-skool', name: 'Skool (via Playwright)', category: 'Social', status: 'planned', color: GRAY.mid, description: 'Community platform via Playwright when a workspace is connected.' },
  // CRM & revenue
  { id: 'tool-ledger', name: 'Ledger', category: 'CRM & Revenue', status: 'connected', color: GRAY.white, description: 'CRM records, read-scoped (query records, not lists). HighLevel is the NLG sales source of truth once connected.' },
  { id: 'tool-paykit', name: 'PayKit', category: 'CRM & Revenue', status: 'planned', color: GRAY.light, description: 'Offer/payment/customer context for Sales.' },
  { id: 'tool-flexpay', name: 'FlexPay', category: 'CRM & Revenue', status: 'planned', color: GRAY.mid, description: 'Financing options for sales offers and payment-plan context.' },
  { id: 'tool-stripe', name: 'Stripe', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Full client implemented — balance + charges live once STRIPE_SECRET_KEY is set.' },
  { id: 'tool-ghl', name: 'GoHighLevel', category: 'CRM & Revenue', status: 'planned', color: GRAY.dark, description: 'CLI wrapper scaffolded; no keys configured.' },
  { id: 'tool-recall', name: 'Recall', category: 'CRM & Revenue', status: 'available', color: GRAY.mid, description: 'AI meeting notetaker. Needs RECALL_API_KEY for API access.' },
  { id: 'tool-plaud', name: 'Plaud', category: 'CRM & Revenue', status: 'connected', color: GRAY.light, description: 'Pocket voice recorder for the room: in-person client meetings, site walks, memos. Transcripts + AI notes over its API; pairs with Recall on the Recordings tab.' },
  { id: 'tool-trakyo', name: 'Trakyo', category: 'CRM & Revenue', status: 'planned', color: GRAY.dim, description: 'Revenue attribution: content → booked calls → payments. Status-only until Trakyo ships a public API (TRAKYO_API_KEY).' },
  // Creative studio
  { id: 'tool-reelkit', name: 'Reelkit Pipeline', category: 'Creative', status: 'connected', color: GRAY.white, description: 'Local render pipeline with per-brand themes and a skill library.' },
  { id: 'tool-renderly', name: 'Renderly CLI', category: 'Creative', status: 'connected', color: GRAY.light, description: 'Authenticated CLI: generate / product-photoshoot / marketing-studio / soul-id.' },
  { id: 'tool-adsmith', name: 'Adsmith', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'UGC ads (Veo/Sora/Kling). Basic auth from env.' },
  { id: 'tool-whisper', name: 'Whisper (local)', category: 'Creative', status: 'connected', color: GRAY.dim, description: 'Local transcription CLI plus ffmpeg. Nothing leaves the host.' },
  { id: 'tool-miro', name: 'Miro', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'REST API with a token from the environment. Architecture boards live here.' },
  { id: 'tool-canva-figma', name: 'Canva + Figma', category: 'Creative', status: 'available', color: GRAY.dark, description: 'Connected as session-scoped MCPs. A standalone API needs separate keys.' },
  // Comms
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-slack', name: 'Slack', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Client implemented. Needs a bot token with channels:read/history scopes.' },
  { id: 'tool-dictate', name: 'Dictate Flow', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Voice dictation. Its local SQLite history is read live.' },
  { id: 'tool-whatsapp', name: 'WhatsApp', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Desktop app local ChatStorage.sqlite, read-only: local team chats.' },
  // Orchestration & infra
  { id: 'tool-command-center', name: 'Command Center (:4000)', category: 'Orchestration', status: 'available', color: GRAY.light, description: 'Kanban, brand deals, sales calls, SOPs and dispatch. Start it with npm run dev.' },
  { id: 'tool-clawline', name: 'Clawline Gateway', category: 'Orchestration', status: 'available', color: GRAY.dim, description: 'Dormant: gateway offline and token missing. Needs a reinstall.' },
  { id: 'tool-tmux', name: 'tmux', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'Multi-session orchestration. The dashboard reads the live session list.' },
  { id: 'tool-ollama', name: 'Ollama', category: 'Orchestration', status: 'available', color: GRAY.mid, description: 'Local LLM server :11434, no auth. Start it to enable free local inference.' },
  { id: 'tool-vercel', name: 'Vercel CLI', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'Authenticated CLI. The deploy target for a public build.' },
  { id: 'tool-gh', name: 'GitHub CLI', category: 'Orchestration', status: 'connected', color: GRAY.dim, description: 'Authenticated CLI for repos, issues and releases.' },
  // Payments (registry awaiting keys)
  { id: 'tool-paypal', name: 'PayPal', category: 'Payments', status: 'planned', color: GRAY.mid, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-square', name: 'Square', category: 'Payments', status: 'planned', color: GRAY.dim, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-whop', name: 'Whop', category: 'Payments', status: 'planned', color: GRAY.dark, description: 'Registered in the processor registry; client lands when keys do.' },
];

// Every row names the phase it advances: the phase cards on /roadmap read
// their bar as done/total of the rows they own, so a row without a phase
// would quietly shrink a percentage instead of showing up in it.
const roadmap: RoadmapItem[] = [
  { id: 'rm-v1', title: 'OS v1 baseline', quarter: '2026-Q2', status: 'done', departmentId: 'dept-leadership', description: 'Six views, SQLite repos, 32 tests.', phaseId: 'phase-2' },
  { id: 'rm-mono', title: 'Monochrome rebuild + real connectors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-leadership', description: 'Black & white theme; IMAP, Slack, Stripe, gbrain wired.', phaseId: 'phase-1' },
  { id: 'rm-gbrain', title: 'G-Brain provider live', quarter: '2026-Q2', status: 'done', departmentId: 'dept-leadership', description: 'gbrain CLI doctor/query + brain-store local fallback.', phaseId: 'phase-1' },
  { id: 'rm-creds-email', title: 'Connect 4 email inboxes', quarter: '2026-Q2', status: 'done', departmentId: 'dept-client-success', description: 'Four Gmail IMAP slots live on app passwords, feeding /comms.', phaseId: 'phase-1' },
  { id: 'rm-creds-slack', title: 'Connect Slack workspace', quarter: '2026-Q2', status: 'done', departmentId: 'dept-client-success', description: 'Bot token reads channels + history for the per-client board.', phaseId: 'phase-1' },
  { id: 'rm-creds-payments', title: 'Connect payment processors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-finance', description: 'Stripe live; PayKit, PayPal and Square in the registry.', phaseId: 'phase-1' },
  { id: 'rm-supabase', title: 'Revive Supabase Second Brain', quarter: '2026-Q2', status: 'done', departmentId: 'dept-leadership', description: 'Free-tier project unpaused; gbrain hybrid queries resolve again.', phaseId: 'phase-1' },
  { id: 'rm-scheduler', title: 'Agent scheduler (cron runs)', quarter: '2026-Q3', status: 'done', departmentId: 'dept-leadership', description: 'Seven schedules on a 60s tick with cron_runs history and catch-up.', phaseId: 'phase-3' },
  { id: 'rm-llm', title: 'LLM summarization layer', quarter: '2026-Q3', status: 'done', departmentId: 'dept-leadership', description: 'Agent chat and digests through the AI Gateway, with model failover.', phaseId: 'phase-3' },
  { id: 'rm-host', title: 'Migrate to a dedicated host', quarter: '2026-Q3', status: 'done', departmentId: 'dept-leadership', description: 'App, gbrain and agents run on the host; Supabase stays managed.', phaseId: 'phase-4' },
  { id: 'rm-embeddings', title: 'Own the embedding stack', quarter: '2026-Q3', status: 'done', departmentId: 'dept-leadership', description: 'Brain moved onto local embeddings before the hosted vendor went away.', phaseId: 'phase-1' },
  { id: 'rm-call-archive', title: 'Archive every sales call', quarter: '2026-Q3', status: 'done', departmentId: 'dept-sales', description: 'CRM and notetaker transcripts exported into brain-store as one page each.', phaseId: 'phase-2' },
  { id: 'rm-recorders', title: 'Voice recorders into the brain', quarter: '2026-Q3', status: 'done', departmentId: 'dept-sales', description: 'Pocket recorder and Recall on /comms; transcripts file themselves into G-Brain.', phaseId: 'phase-2' },
  { id: 'rm-trading', title: 'Trading board', quarter: '2026-Q3', status: 'done', departmentId: 'dept-finance', description: 'Robinhood and Phantom sleeves, agent reasoning, orders and trade log.', phaseId: 'phase-2' },
  { id: 'rm-usage', title: 'Token burn board', quarter: '2026-Q3', status: 'done', departmentId: 'dept-leadership', description: 'Live seat-by-seat spend after the August burn; other boxes push in.', phaseId: 'phase-2' },
  { id: 'rm-workers', title: 'Worker pool on the host', quarter: '2026-Q3', status: 'now', departmentId: 'dept-leadership', description: 'Cheap model seats behind the Conductor. Hardening and gateway install left.', phaseId: 'phase-3' },
  { id: 'rm-statements', title: 'Statement ingestion', quarter: '2026-Q3', status: 'now', departmentId: 'dept-finance', description: 'Card and bank statements parsed into /finances instead of hand entry.', phaseId: 'phase-1' },
  { id: 'rm-railway', title: 'Move hosting to Railway', quarter: '2026-Q3', status: 'now', departmentId: 'dept-leadership', description: 'Every app moving to one platform; the gated OS demo went first as the pilot.', phaseId: 'phase-4' },
  { id: 'rm-ui', title: 'Interaction rebrand', quarter: '2026-Q3', status: 'now', departmentId: 'dept-leadership', description: 'Design pass over the whole OS now the integrations are live.', phaseId: 'phase-2' },
  { id: 'rm-auth', title: 'Auth + remote access', quarter: '2026-Q4', status: 'next', departmentId: 'dept-leadership', description: 'Reach the OS on the host from anywhere, safely.', phaseId: 'phase-4' },
  { id: 'rm-postiz', title: 'Replace Postly with Postiz', quarter: '2026-Q4', status: 'next', departmentId: 'dept-client-success', description: 'Self-hosted scheduler with ungated post and channel analytics.', phaseId: 'phase-1' },
  { id: 'rm-board-embed', title: 'Board fully inside the OS', quarter: '2026-Q4', status: 'later', departmentId: 'dept-leadership', description: 'Conductor and 40+ agents driven from the OS, SOPs running as real skills.', phaseId: 'phase-3' },
];

// Honest zeros — these flip to live numbers as connectors come online.
const metrics: Metric[] = [
  { id: 'metric-unread', key: 'unread_total', label: 'Unread (all inboxes)', value: 0, unit: 'emails', delta: 0, period: 'pending creds' },
  { id: 'metric-brain', key: 'brain_pages', label: 'Brain-store Pages', value: 0, unit: 'pages', delta: 0, period: 'run Data Agent' },
  { id: 'metric-balance', key: 'stripe_available', label: 'Stripe Available', value: 0, unit: 'usd', delta: 0, period: 'pending creds' },
  { id: 'metric-runs', key: 'agent_runs', label: 'Agent Runs Logged', value: 0, unit: 'runs', delta: 0, period: 'all time' },
];

const domains: Domain[] = [
  { id: 'brm-1', number: 1, title: 'Command & Memory', color: GRAY.white, items: ['G-Brain (gbrain CLI)', 'brain-store markdown', 'Agent run history', 'Operator dashboard'] },
  { id: 'brm-2', number: 2, title: 'Email Operations', color: GRAY.light, items: ['Four IMAP inboxes', 'Unread triage', 'Per-inbox health', 'Digest (planned)'] },
  { id: 'brm-3', number: 3, title: 'Team Comms', color: GRAY.light, items: ['Slack channels', 'Message digests', 'Mention tracking (planned)'] },
  { id: 'brm-4', number: 4, title: 'Payments & Revenue', color: GRAY.mid, items: ['Stripe balance + charges', 'PayPal / Square / Whop registry', 'Reconciliation (planned)'] },
  { id: 'brm-5', number: 5, title: 'Knowledge & Docs', color: GRAY.mid, items: ['Notes vault', 'Local embeddings', 'Supabase Second Brain'] },
  { id: 'brm-6', number: 6, title: 'Agent Runtime', color: GRAY.dim, items: ['Registry + run()', 'Persisted run log', 'Honest failure states'] },
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['Current host', 'dedicated host (next)', 'SQLite local', 'Supabase managed'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-1', number: 1, title: 'Real Connections', items: ['4 email inboxes', 'Slack', 'Payment processors', 'G-Brain'] },
  { id: 'phase-2', number: 2, title: 'Real Agents', items: ['Runtime + run log', 'Honest status board', 'On-demand runs'] },
  { id: 'phase-3', number: 3, title: 'Autonomy', items: ['Scheduled runs', 'LLM digests', 'Failure alerts'] },
  { id: 'phase-4', number: 4, title: 'Dedicated Host', items: ['Migrate compute', 'Remote access + auth', '24/7 uptime'] },
];

// The @founderos.ai footprint, handles straight from the Postly config.
const socialAccounts: SocialAccount[] = [];
const socialBaseline: SocialSnapshot[] = [];
const emailListBaseline: EmailListSnapshot[] = [];
const socialDms: SocialDm[] = [];
const socialDmMessages: SocialDmMessage[] = [];
const socialDmSnapshots: SocialDmSnapshot[] = [];
const socialPosts: SocialPost[] = [];


// ── Funnel journeys — DUMMY clients from first touch to conversion ──────────
// Real-ready: `source` on every touch names where it will come from live —
// 'trakyo' (organic attribution), 'meta-ads' (Meta Ads MCP), 'manual' until
// then. Swapping seed for live pulls is a repo-level change; the shape stays.
// Touch dates are DAYS-AGO offsets resolved at seed time, so the space's
// stall coloring (quiet > 7 days pre-conversion → red) stays truthful no
// matter when the DB is re-seeded.
const funnelContacts: FunnelContact[] = [];
const funnelTouches: FunnelTouch[] = [];


// The machine, mapped: each venture's process as an owned chain of steps.
// Real-ready — owners, weekly hours, tools, the bottlenecks that leak money,
// and the automations (live or suggested) that carry the load back.
const workflows: Workflow[] = [];


// Agent task board — seeded across open/doing/done so the Kanban is alive on
// first load. Demo cards; user-added tasks coexist (we insert by id, never wipe).
const SEED_TS = '2026-07-21T12:00:00.000Z';
const agentTasks: AgentTask[] = [];


const SKILL_STATUS_NOTE: Record<string, string> = {
  live: 'Live in production. The owning agent runs this today.',
  learning: 'In training. Runs with a human in the loop while it calibrates.',
  planned: 'Planned. Scoped and queued, not yet wired.',
};

/** Compose a real-ready SKILL.md doc from a skill's fields (viewed from its card). */
function skillDoc(s: Omit<Skill, 'markdown'>): string {
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const toolLine = s.tools.length ? s.tools.map((t) => `\`${t}\``).join(', ') : 'no external tools';
  return `---
name: ${slug}
description: ${s.description}
category: ${s.category}
status: ${s.status}
---

# ${s.name}

${s.description}

## When to use
Reach for this when the ${s.category.toLowerCase()} flow needs to ${s.name.toLowerCase()}. It runs on ${toolLine}.

## Status
${SKILL_STATUS_NOTE[s.status] ?? s.status}
`;
}

// The capability library the agent workforce draws on.
const skills: Omit<Skill, 'markdown'>[] = [
  { id: 'skill-outbound', name: 'Cold outbound sequencing', category: 'Sales', description: 'Multi-touch DM + content cadence that opens conversations at scale.', ownerAgentId: 'postly-publisher', status: 'live', tools: ['postly', 'dmflow'], order: 0 },
  { id: 'skill-qualify', name: 'Reply qualification', category: 'Sales', description: 'Reads inbound replies, scores intent, and books the qualified ones.', ownerAgentId: 'comms-agent', status: 'live', tools: ['dmflow', 'gmail'], order: 1 },
  { id: 'skill-proposal', name: 'Proposal drafting', category: 'Sales', description: 'Turns a call transcript into a tailored, on-brand proposal.', ownerAgentId: null, status: 'learning', tools: ['proposal-gen', 'ledger'], order: 2 },
  { id: 'skill-hooks', name: 'Hook writing', category: 'Content', description: 'Short-form hooks and captions tuned to each platform.', ownerAgentId: 'social-agent', status: 'live', tools: ['postly'], order: 3 },
  { id: 'skill-ugc', name: 'UGC generation', category: 'Content', description: 'Generates ad-ready UGC variants (Veo / Sora / Kling).', ownerAgentId: 'adsmith-creative', status: 'live', tools: ['adsmith'], order: 4 },
  { id: 'skill-edit', name: 'Video editing', category: 'Content', description: 'Cuts reels and highlight clips programmatically.', ownerAgentId: 'reelkit-editor', status: 'live', tools: ['reelkit'], order: 5 },
  { id: 'skill-schedule', name: 'Cross-post scheduling', category: 'Content', description: 'Queues and publishes across every connected platform.', ownerAgentId: 'postly-publisher', status: 'live', tools: ['postly'], order: 6 },
  { id: 'skill-triage', name: 'Inbox triage', category: 'Ops', description: 'Sorts the four inboxes into work / personal / misc and flags priority.', ownerAgentId: 'gmail-worker', status: 'live', tools: ['gmail'], order: 7 },
  { id: 'skill-dm', name: 'DM management', category: 'Ops', description: 'Handles Instagram and WhatsApp DMs end to end.', ownerAgentId: 'comms-agent', status: 'live', tools: ['dmflow', 'whatsapp'], order: 8 },
  { id: 'skill-retrieval', name: 'Knowledge retrieval', category: 'Ops', description: 'Hybrid search over G-Brain so every agent shares one memory.', ownerAgentId: 'conductor', status: 'live', tools: ['gbrain'], order: 9 },
  { id: 'skill-reconcile', name: 'Payment reconciliation', category: 'Ops', description: 'Matches processor payouts to clients across Stripe and PayKit.', ownerAgentId: null, status: 'planned', tools: ['stripe', 'paykit'], order: 10 },
  { id: 'skill-attribution', name: 'Revenue attribution', category: 'Ops', description: 'Ties content and calls to closed revenue via Trakyo.', ownerAgentId: null, status: 'planned', tools: ['trakyo', 'ghl'], order: 11 },
];

// A deterministic xorshift stream seeded from a string (no Math.random), so the
// seeded run history is stable across re-seeds.
function seedRand(str: string): () => number {
  let h = 2166136261 >>> 0;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return (h >>> 0) / 4294967295;
  };
}

// Leads/specialists run on the bigger model, workers on the cheaper one, so the
// cost analysis has real spread. About a third of agents are pure-connector and
// carry no token cost.
const RUN_MODEL_BY_TIER: Record<string, string> = {
  lead: 'claude-sonnet-5',
  specialist: 'claude-sonnet-5',
  worker: 'claude-haiku-4.5',
};

/**
 * Seeded agent-run history so /agents shows live runtimes and estimated spend
 * out of the box (demo-first). Stable ids (`seed-run-*`) keep re-seeds
 * idempotent and let the operator's own real runs coexist. Real token usage
 * flows in through lib/agents/runtime as agents actually run.
 */
function seededAgentRuns(agentList: Agent[]): AgentRun[] {
  const now = Date.now();
  const runs: AgentRun[] = [];
  for (const a of agentList) {
    const rnd = seedRand(`runs:${a.id}`);
    const count = 5 + Math.floor(rnd() * 10); // 5..14 runs each
    const usesModel = rnd() > 0.3; // ~2/3 of agents bill an LLM
    const model = RUN_MODEL_BY_TIER[a.tier] ?? 'claude-sonnet-5';
    for (let i = 0; i < count; i++) {
      const startedAt = new Date(now - rnd() * 20 * 86_400_000).toISOString(); // within ~3 weeks
      const durMs = 400 + Math.floor(rnd() * 7000);
      const finishedAt = new Date(Date.parse(startedAt) + durMs).toISOString();
      const ok = rnd() > 0.08;
      let tokensIn: number | null = null;
      let tokensOut: number | null = null;
      let runModel: string | null = null;
      let costUsd: number | null = null;
      if (usesModel) {
        tokensIn = 800 + Math.floor(rnd() * 14000);
        tokensOut = 200 + Math.floor(rnd() * 4000);
        runModel = model;
        costUsd = Math.round(runCostUsd(tokensIn, tokensOut, runModel) * 1e6) / 1e6;
      }
      runs.push({
        id: `seed-run-${a.id}-${i}`,
        agentId: a.id,
        startedAt,
        finishedAt,
        ok,
        summary: ok ? `${a.name} completed a run.` : `${a.name} run failed and was retried.`,
        model: runModel,
        tokensIn,
        tokensOut,
        costUsd,
      });
    }
  }
  return runs;
}

// --- Proposals -----------------------------------------------------------
// Client proposals are the one table this demo ships EMPTY on purpose: a real
// row carries a client's name, the deal size, and the share code that opens
// the page. Create them from the OS instead (they land with origin 'os', which
// a re-seed leaves alone). The export and its type stay so every reader of the
// Deliverables folder keeps compiling.
export const SEEDED_PROPOSALS: Proposal[] = [];

/**
 * Proposals, re-applied on every boot rather than only when the table is empty.
 *
 * getDb()'s guard fires when a table has NO rows, which back-fills a new table
 * but never propagates an EDIT to an existing one. So correcting a client name
 * or adding a proposal would land on a fresh clone and silently never reach the
 * host, whose database already has the old rows. Re-syncing here is cheap (a
 * handful of rows) and safe: seeded rows are replaced by id, and anything
 * Alex adds through the OS carries origin 'os' and is left alone.
 */
export function syncSeededProposals(db: FounderDb): void {
  for (const p of SEEDED_PROPOSALS) db.proposals.insert(p);
  db.proposals.deleteSeededNotIn(SEEDED_PROPOSALS.map((p) => p.id));
}

/**
 * Scheduled jobs that ship with the OS, starting with a 9am sweep of every
 * inbox, WhatsApp and Slack that lands as one ranked report. Seeded rather than
 * hand-created so they survive a fresh database and appear on every install; the runner is the tick in
 * instrumentation.ts -> POST /api/cron/tick.
 */
export const seededCrons: AgentCron[] = [
  {
    id: 'cron-comms-digest-0900',
    agentId: 'comms-digest',
    schedule: '0 9 * * *',
    description: 'Morning comms report: 24h of email, WhatsApp and Slack, ranked by who needs a reply',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-plaud-ingest-30m',
    agentId: 'sales-calls-data',
    schedule: '*/30 * * * *',
    description: 'File every newly transcribed Plaud recording into G-Brain (summary + transcript) and its action items into the claim store; no LLM, pure code',
    enabled: true,
    createdAt: '2026-08-26T00:00:00.000Z',
  },
  // Every cron below maps onto an agent whose run genuinely does the described
  // check. Each description says what that agent ACTUALLY does, not the job it
  // was proposed for: a cron fires the agent, it does not carry its own
  // instructions. Jobs with no agent behind them (nightly green check, offsite
  // backup, model-usage posture) belong in the host's own routine runner, so
  // they are deliberately absent rather than seeded as rows that would never
  // work.
  {
    id: 'cron-stack-monitor-0700',
    agentId: 'stack-monitor',
    schedule: '0 7 * * *',
    description: 'Local stack check: the command center, the worker pool, G-Brain and the CLIs the OS shells out to',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-payments-pulse-0800',
    agentId: 'payments-pulse',
    schedule: '0 8 * * *',
    description: 'Payment processors reachable, plus Stripe balance and recent charges',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-client-onboarding-0830',
    agentId: 'client-onboarding',
    schedule: '30 8 * * *',
    description: 'Onboarding SOP readiness: the Ledger trigger and the Slack workspace it provisions',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-crm-pulse-0900',
    agentId: 'crm-pulse',
    schedule: '0 9 * * 1-5',
    description: 'HighLevel deals pipeline for NLG Agency',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-social-agent-1800',
    agentId: 'social-agent',
    schedule: '0 18 * * *',
    description: 'Postly publishing and Adsmith ad generation, checked before the evening',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
];

/**
 * Bump this whenever the seed's CONTENT changes in a way production must see,
 * above all a removal.
 *
 * getDb() otherwise only seeds when a table is empty, so on a long-lived
 * install — where every table has been full for months — the seed would never
 * run at all: rows deleted from this file went on being served in production
 * because nothing ever re-ran the seed. The stamp forces exactly one re-seed
 * per change.
 */
export const SEED_VERSION = '2026-10-06-nlg-agency';

export function seedDatabase(db: FounderDb): void {
  // INSERT OR REPLACE in every repo makes re-seeding idempotent by id.
  for (const c of seededCrons) db.agentCrons.insert(c);
  for (const d of departments) db.departments.insert(d);
  for (const a of agents) db.agents.insert(a);
  // The roster IS the runtime: rows that left the roster leave the DB too,
  // and departments that left the operating model go with them — but only
  // after child tables that FK to departments have been pruned.
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
  for (const p of people) db.people.insert(p);
  db.people.deleteWhereIdNotIn(people.map((p) => p.id));
  for (const m of leadMagnets) db.leadMagnets.insert(m);
  db.leadMagnets.deleteWhereIdNotIn(leadMagnets.map((m) => m.id));
  for (const t of sopTasks) db.sopTasks.insert(t);
  db.sopTasks.deleteWhereIdNotIn(sopTasks.map((t) => t.id));
  db.tools.deleteWhereIdNotIn(tools.map((t) => t.id));
  for (const w of workflows) db.workflows.insert(w);
  db.workflows.deleteWhereIdNotIn(workflows.map((w) => w.id));
  for (const s of skills) db.skills.insert({ ...s, markdown: skillDoc(s) });
  db.skills.deleteWhereIdNotIn(skills.map((s) => s.id));
  for (const t of agentTasks) db.agentTasks.insert(t); // insert-by-id; user tasks coexist
  // Seeded run history (idempotent by id) so /agents shows runtimes + spend; the
  // operator's own real runs (uuid ids) coexist and add real token cost over time.
  for (const r of seededAgentRuns(agents)) db.agentRuns.insert(r);
  for (const t of tools) db.tools.insert(t);
  for (const r of roadmap) db.roadmap.insert(r);
  // A row that left the seed left the plan: prune it so retired work cannot
  // outlive its removal on a long-lived install.
  db.roadmap.deleteWhereIdNotIn(roadmap.map((r) => r.id));
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));
  for (const m of metrics) db.metrics.insert(m);
  for (const d of domains) db.domains.insert(d);
  for (const p of PERSONAS) db.personas.insert(p);
  for (const p of phases) db.phases.insert(p);
  db.social.clearSeededAudience();
  for (const a of socialAccounts) db.social.upsertAccount(a);
  for (const s of socialBaseline) db.social.insertSnapshot(s);
  for (const d of socialDms) db.social.upsertDm(d);
  for (const s of socialDmSnapshots) db.social.insertDmSnapshot(s);
  for (const m of socialDmMessages) db.social.upsertDmMessage(m);
  db.emailList.deleteSeeded();
  for (const s of emailListBaseline) db.emailList.insertSnapshot(s);
  for (const p of socialPosts) db.socialPosts.enqueue(p);
  db.funnel.clearAll();
  for (const c of funnelContacts) db.funnel.insertContact(c);
  for (const t of funnelTouches) db.funnel.insertTouch(t);
  syncSeededProposals(db);
  // Do not seed fake trading balances. Live Markets-agent rows (source !== seed)
  // stay; a local DB reset is what drops leftover demo snapshots.

  // Last: a half-finished seed must not claim to be up to date.
  db.meta.set('seed_version', SEED_VERSION);
}
