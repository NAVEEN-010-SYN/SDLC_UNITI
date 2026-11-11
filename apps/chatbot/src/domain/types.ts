/**
 * Core domain types for the chatbot. Vocabulary follows CONVENTIONS.md
 * (Account, Service, Ticket, Invoice, roles, money in minor units).
 */

export type Role =
  | 'CONSUMER'
  | 'BUSINESS_ADMIN'
  | 'BUSINESS_USER'
  | 'PARTNER_ADMIN'
  | 'PARTNER_AGENT'
  | 'WHOLESALE_BUYER'
  | 'SUPPORT_AGENT';

export type Channel = 'WEB_WIDGET' | 'REST';

export interface Principal {
  userId: string;
  accountId: string;
  roles: Role[];
  displayName?: string;
}

export interface Money {
  /** Integer minor units (cents/pence). */
  amountMinor: number;
  currency: string;
}

export type IntentName =
  | 'CHECK_OUTAGE'
  | 'BILL_ENQUIRY'
  | 'RESET_ROUTER'
  | 'PLAN_UPGRADE'
  | 'RAISE_TICKET'
  | 'TALK_TO_AGENT'
  | 'GREETING'
  | 'GOODBYE'
  | 'AFFIRM'
  | 'DENY'
  | 'CANCEL'
  | 'FALLBACK';

export interface Entity {
  type: EntityType;
  value: string;
  /** Character offsets in the original (unredacted) utterance. */
  start: number;
  end: number;
}

export type EntityType =
  | 'ACCOUNT_ID'
  | 'POSTCODE'
  | 'INVOICE_ID'
  | 'TICKET_ID'
  | 'SPEED'
  | 'PHONE'
  | 'EMAIL'
  | 'DATE';

export interface IntentPrediction {
  intent: IntentName;
  confidence: number;
  source: 'rules' | 'llm' | 'context';
  entities: Entity[];
}

export type MessageAuthor = 'USER' | 'BOT' | 'AGENT' | 'SYSTEM';

export interface QuickReply {
  label: string;
  payload: string;
}

export interface BotReply {
  text: string;
  quickReplies?: QuickReply[];
  /** Structured card data the widget may render (invoice summary, plan list, ...). */
  card?: ReplyCard;
}

export type ReplyCard =
  | { kind: 'INVOICE'; invoiceId: string; total: Money; dueDate: string; status: string }
  | { kind: 'PLANS'; plans: Array<{ code: string; name: string; downloadMbps: number; monthly: Money }> }
  | { kind: 'TICKET'; ticketId: string; priority: TicketPriority; status: TicketStatus }
  | { kind: 'OUTAGE'; region: string; status: string; estimatedRestore?: string };

export interface TranscriptEntry {
  id: string;
  conversationId: string;
  author: MessageAuthor;
  /** Already PII-redacted text; raw text is never persisted. */
  text: string;
  intent?: IntentName;
  confidence?: number;
  createdAt: string;
}

export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';

export type ConversationStatus = 'ACTIVE' | 'HANDED_OFF' | 'ENDED';

export interface SlotValues {
  [slot: string]: string | number | boolean | undefined;
}

export interface FlowState {
  flowId: string;
  state: string;
  slots: SlotValues;
  /** How many times the current slot prompt has been re-asked after invalid input. */
  retries: number;
  startedAt: string;
}

export interface Conversation {
  id: string;
  principal: Principal;
  channel: Channel;
  status: ConversationStatus;
  activeFlow?: FlowState;
  /** Flows suspended by an interrupting intent, resumed LIFO. */
  suspendedFlows: FlowState[];
  lastIntent?: IntentName;
  fallbackCount: number;
  createdAt: string;
  updatedAt: string;
  handoff?: { queue: string; requestedAt: string; reason: string; ticketId?: string };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
