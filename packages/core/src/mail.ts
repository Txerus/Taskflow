import { z } from "zod";
const mailIdSchema = z.string().uuid();
const mailDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00");
    return (
      !Number.isNaN(+d) &&
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}` === s
    );
  }, "Date invalide");

export const mailProviderSchema = z.enum(["google", "microsoft"]);
export type MailProvider = z.infer<typeof mailProviderSchema>;

export const mailAddressSchema = z
  .object({
    name: z.string().max(300).default(""),
    email: z.string().trim().email().max(320),
  })
  .strict();
export type MailAddress = z.infer<typeof mailAddressSchema>;

export interface MailAccount {
  id: string;
  provider: MailProvider;
  email: string;
  displayName: string;
  lastSyncAt: string | null;
  syncCursor: string | null;
  createdAt: string;
}

export interface MailAttachment {
  id: string;
  messageId: string;
  providerAttachmentId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface MailMessage {
  id: string;
  accountId: string;
  providerMessageId: string;
  threadId: string | null;
  internetMessageId: string | null;
  subject: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  receivedAt: string;
  sentAt: string | null;
  snippet: string;
  bodyText: string;
  unread: boolean;
  hasAttachments: boolean;
  folder: "inbox" | "sent" | "archive" | "other";
  taskId: string | null;
  syncedAt: string;
}

export interface MailWaiting {
  id: string;
  messageId: string;
  expectedFrom: string;
  dueDate: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  senderContains: string;
  subjectContains: string;
  unreadOnly: boolean;
  createTask: boolean;
  priority: 1 | 2 | 3 | 4;
  createdAt: string;
  updatedAt: string;
}

export interface MailSnapshot {
  accounts: MailAccount[];
  messages: MailMessage[];
  waiting: MailWaiting[];
  rules: MailRule[];
}

export const mailAccountInputSchema = z
  .object({
    id: mailIdSchema.optional(),
    provider: mailProviderSchema,
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().max(300).default(""),
    syncCursor: z.string().max(10000).nullable().default(null),
    lastSyncAt: z.iso.datetime().nullable().default(null),
  })
  .strict();

export const mailMessageInputSchema = z
  .object({
    accountId: mailIdSchema,
    providerMessageId: z.string().trim().min(1).max(2000),
    threadId: z.string().max(2000).nullable().default(null),
    internetMessageId: z.string().max(2000).nullable().default(null),
    subject: z.string().max(2000).default(""),
    from: mailAddressSchema,
    to: z.array(mailAddressSchema).max(500).default([]),
    cc: z.array(mailAddressSchema).max(500).default([]),
    receivedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable().default(null),
    snippet: z.string().max(10000).default(""),
    bodyText: z.string().max(2_000_000).default(""),
    unread: z.boolean().default(false),
    hasAttachments: z.boolean().default(false),
    folder: z.enum(["inbox", "sent", "archive", "other"]).default("inbox"),
  })
  .strict();
export type MailMessageInput = z.infer<typeof mailMessageInputSchema>;

export const mailAttachmentInputSchema = z
  .object({
    providerAttachmentId: z.string().trim().min(1).max(2000),
    name: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().min(1).max(300),
    size: z.number().int().min(0).max(100 * 1024 * 1024),
  })
  .strict();

export const mailWaitingInputSchema = z
  .object({
    messageId: mailIdSchema,
    expectedFrom: z.string().trim().email().max(320),
    dueDate: mailDaySchema.nullable().default(null),
  })
  .strict();

export const mailRuleInputSchema = z
  .object({
    id: mailIdSchema.optional(),
    name: z.string().trim().min(1).max(100),
    enabled: z.boolean().default(true),
    senderContains: z.string().trim().max(320).default(""),
    subjectContains: z.string().trim().max(500).default(""),
    unreadOnly: z.boolean().default(false),
    createTask: z.boolean().default(true),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(3),
  })
  .strict()
  .refine((v) => !!v.senderContains || !!v.subjectContains, {
    message: "Ajoutez au moins un critère expéditeur ou objet.",
  });
export type MailRuleInput = z.infer<typeof mailRuleInputSchema>;

export const mailReplySchema = z
  .object({
    accountId: mailIdSchema,
    messageId: mailIdSchema,
    body: z.string().trim().min(1).max(200_000),
  })
  .strict();
export type MailReply = z.infer<typeof mailReplySchema>;


export interface MailActionSuggestion {
  actionable: boolean;
  confidence: number;
  reasons: string[];
  suggestedTitle: string;
}

/**
 * Détection locale et déterministe d'une demande dans un e-mail.
 * Aucun contenu n'est envoyé à un service tiers. Cette suggestion assiste
 * l'utilisateur mais ne crée jamais une tâche automatiquement.
 */
export function detectMailAction(input: {
  subject: string;
  bodyText: string;
}): MailActionSuggestion {
  const subject = input.subject.trim();
  const body = input.bodyText.replace(/\s+/g, " ").trim();
  const text = `${subject} ${body}`.toLocaleLowerCase("fr-FR");
  const reasons: string[] = [];
  let score = 0;

  const requestPatterns = [
    /\b(peux[- ]tu|pouvez[- ]vous|pourrais[- ]tu|pourriez[- ]vous|merci de|merci d['’]|veuillez|j['’]ai besoin|il faudrait)\b/i,
    /\b(can you|could you|would you|please|need you to|would like you to)\b/i,
  ];
  const deadlinePatterns = [
    /\b(avant|d['’]ici|pour le|au plus tard|échéance|deadline)\b/i,
    /\b(by|before|due|deadline|asap)\b/i,
  ];
  const actionPatterns = [
    /\b(envoyer|répondre|valider|confirmer|vérifier|préparer|mettre à jour|planifier|appeler|transmettre|retourner|compléter|signer)\b/i,
    /\b(send|reply|confirm|check|review|prepare|update|schedule|call|complete|sign)\b/i,
  ];

  if (requestPatterns.some((p) => p.test(text))) {
    score += 0.48;
    reasons.push("demande explicite");
  }
  if (actionPatterns.some((p) => p.test(text))) {
    score += 0.3;
    reasons.push("action identifiable");
  }
  if (deadlinePatterns.some((p) => p.test(text))) {
    score += 0.18;
    reasons.push("échéance mentionnée");
  }
  if (/\?/.test(body)) {
    score += 0.08;
    reasons.push("question adressée");
  }

  const confidence = Math.min(1, Math.round(score * 100) / 100);
  const cleanSubject = subject.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim();
  return {
    actionable: confidence >= 0.45,
    confidence,
    reasons,
    suggestedTitle: cleanSubject
      ? `Traiter : ${cleanSubject.slice(0, 180)}`
      : "Traiter la demande reçue par e-mail",
  };
}
