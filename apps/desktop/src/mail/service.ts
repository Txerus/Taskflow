import type { SqliteDataStore } from "../../../../packages/data/src/sqlite";
import {
  taskInputSchema,
  type MailAccount,
  type MailAddress,
  type MailMessage,
} from "@taskflow/core";
import { MailOAuth } from "./oauth";

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: { name: string; value: string }[];
  } & GmailPart;
};

function apiError(provider: string, status: number, body: string) {
  let detail = body.slice(0, 500);
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    detail =
      typeof parsed.error === "object"
        ? (parsed.error.message ?? detail)
        : (parsed.message ?? parsed.error ?? detail);
  } catch {}
  return new Error(`${provider} : ${detail || `erreur ${status}`}`);
}

async function request<T>(
  provider: string,
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw apiError(provider, response.status, body);
  return body ? (JSON.parse(body) as T) : (undefined as T);
}

function decodeBase64Url(value = "") {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function gmailBody(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const text = gmailBody(child);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data)
    return stripHtml(decodeBase64Url(part.body.data));
  return "";
}

function gmailAttachments(part?: GmailPart) {
  const out: {
    providerAttachmentId: string;
    name: string;
    mimeType: string;
    size: number;
  }[] = [];
  const visit = (p?: GmailPart) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId)
      out.push({
        providerAttachmentId: p.body.attachmentId,
        name: p.filename,
        mimeType: p.mimeType || "application/octet-stream",
        size: p.body.size ?? 0,
      });
    for (const child of p.parts ?? []) visit(child);
  };
  visit(part);
  return out;
}

function header(message: GmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (h) => h.name.toLocaleLowerCase("en") === name.toLocaleLowerCase("en"),
    )?.value ?? ""
  );
}

function address(value: string, fallback: string): MailAddress {
  const match = value.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  const email = (match?.[2] ?? value).trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return {
    name: (match?.[1] ?? "").trim(),
    email: valid ? email : fallback,
  };
}

function addresses(value: string, fallback: string) {
  if (!value.trim()) return [];
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((x) => address(x.trim(), fallback))
    .filter((x, i, all) => all.findIndex((y) => y.email === x.email) === i);
}

function graphAddress(
  raw: { emailAddress?: { name?: string; address?: string } } | undefined,
  fallback: string,
): MailAddress {
  const email = raw?.emailAddress?.address?.trim() ?? "";
  return {
    name: raw?.emailAddress?.name ?? "",
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : fallback,
  };
}

export class MailService {
  constructor(
    private readonly store: SqliteDataStore,
    private readonly oauth: MailOAuth,
  ) {}

  private account(id: string) {
    const account = this.store.mail.snapshot().accounts.find((a) => a.id === id);
    if (!account) throw new Error("Compte mail introuvable.");
    return account;
  }

  private async applyRules(message: MailMessage) {
    if (message.folder !== "inbox" || message.taskId) return;
    const rule = this.store.mail
      .matchingRules(message)
      .find((r) => r.createTask);
    if (!rule) return;
    await this.store.createTaskFromMail(
      message.id,
      taskInputSchema.parse({
        title: `E-mail : ${message.subject || "(sans objet)"}`,
        description: [
          `Règle mail : ${rule.name}`,
          `De : ${message.from.name || message.from.email} <${message.from.email}>`,
          "",
          message.snippet || message.bodyText.slice(0, 1000),
        ].join("\n"),
        priority: rule.priority,
      }),
    );
  }

  async sync(accountId: string) {
    const account = this.account(accountId);
    const token = await this.oauth.accessToken(accountId);
    const count =
      account.provider === "google"
        ? await this.syncGoogle(account, token)
        : await this.syncMicrosoft(account, token);
    this.store.mail.saveAccount({
      id: account.id,
      provider: account.provider,
      email: account.email,
      displayName: account.displayName,
      syncCursor: account.syncCursor,
      lastSyncAt: new Date().toISOString(),
    });
    return count;
  }

  private async syncGoogle(account: MailAccount, token: string) {
    const list = await request<{ messages?: { id: string }[] }>(
      "Gmail",
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=newer_than%3A90d",
      token,
    );
    let count = 0;
    for (const item of list.messages ?? []) {
      const m = await request<GmailMessage>(
        "Gmail",
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
        token,
      );
      const receivedAt = new Date(
        Number(m.internalDate ?? Date.now()),
      ).toISOString();
      const from = address(header(m, "From"), account.email);
      const saved = this.store.mail.upsertMessage({
        accountId: account.id,
        providerMessageId: m.id,
        threadId: m.threadId ?? null,
        internetMessageId: header(m, "Message-ID") || null,
        subject: header(m, "Subject"),
        from,
        to: addresses(header(m, "To"), account.email),
        cc: addresses(header(m, "Cc"), account.email),
        receivedAt,
        sentAt: null,
        snippet: m.snippet ?? "",
        bodyText: gmailBody(m.payload),
        unread: (m.labelIds ?? []).includes("UNREAD"),
        hasAttachments: gmailAttachments(m.payload).length > 0,
        folder: (m.labelIds ?? []).includes("SENT") ? "sent" : "inbox",
      });
      this.store.mail.replaceAttachments(saved.id, gmailAttachments(m.payload));
      await this.applyRules(saved);
      count++;
    }
    return count;
  }

  private async syncMicrosoft(account: MailAccount, token: string) {
    type GraphMessage = {
      id: string;
      conversationId?: string;
      internetMessageId?: string;
      subject?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
      toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
      ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
      receivedDateTime: string;
      sentDateTime?: string;
      bodyPreview?: string;
      body?: { contentType?: string; content?: string };
      isRead?: boolean;
      hasAttachments?: boolean;
    };
    const select = [
      "id",
      "conversationId",
      "internetMessageId",
      "subject",
      "from",
      "toRecipients",
      "ccRecipients",
      "receivedDateTime",
      "sentDateTime",
      "bodyPreview",
      "body",
      "isRead",
      "hasAttachments",
    ].join(",");
    const result = await request<{ value: GraphMessage[] }>(
      "Microsoft Graph",
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=100&$orderby=receivedDateTime%20desc&$select=${encodeURIComponent(select)}`,
      token,
      { headers: { Prefer: 'outlook.body-content-type="text"' } },
    );
    for (const m of result.value) {
      const saved = this.store.mail.upsertMessage({
        accountId: account.id,
        providerMessageId: m.id,
        threadId: m.conversationId ?? null,
        internetMessageId: m.internetMessageId ?? null,
        subject: m.subject ?? "",
        from: graphAddress(m.from, account.email),
        to: (m.toRecipients ?? []).map((x) => graphAddress(x, account.email)),
        cc: (m.ccRecipients ?? []).map((x) => graphAddress(x, account.email)),
        receivedAt: new Date(m.receivedDateTime).toISOString(),
        sentAt: m.sentDateTime ? new Date(m.sentDateTime).toISOString() : null,
        snippet: m.bodyPreview ?? "",
        bodyText:
          m.body?.contentType?.toLowerCase() === "html"
            ? stripHtml(m.body.content ?? "")
            : (m.body?.content ?? m.bodyPreview ?? ""),
        unread: !m.isRead,
        hasAttachments: !!m.hasAttachments,
        folder: "inbox",
      });
      if (m.hasAttachments) {
        const attachments = await request<{
          value: {
            id: string;
            name?: string;
            contentType?: string;
            size?: number;
            isInline?: boolean;
          }[];
        }>(
          "Microsoft Graph",
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`,
          token,
        );
        this.store.mail.replaceAttachments(
          saved.id,
          attachments.value
            .filter((a) => !a.isInline)
            .map((a) => ({
              providerAttachmentId: a.id,
              name: a.name || "pièce-jointe",
              mimeType: a.contentType || "application/octet-stream",
              size: a.size ?? 0,
            })),
        );
      } else this.store.mail.replaceAttachments(saved.id, []);
      await this.applyRules(saved);
    }
    return result.value.length;
  }

  async attachment(messageId: string, attachmentId: string) {
    const message = this.store.mail.getMessage(messageId);
    const meta = this.store.mail
      .attachments(messageId)
      .find((a) => a.id === attachmentId);
    if (!meta) throw new Error("Pièce jointe introuvable.");
    const account = this.account(message.accountId);
    const token = await this.oauth.accessToken(account.id);
    if (account.provider === "google") {
      const result = await request<{ data?: string }>(
        "Gmail",
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.providerMessageId)}/attachments/${encodeURIComponent(meta.providerAttachmentId)}`,
        token,
      );
      if (!result.data) throw new Error("Pièce jointe Gmail vide.");
      return { meta, bytes: Buffer.from(result.data.replace(/-/g, "+").replace(/_/g, "/"), "base64") };
    }
    const result = await request<{ contentBytes?: string }>(
      "Microsoft Graph",
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.providerMessageId)}/attachments/${encodeURIComponent(meta.providerAttachmentId)}`,
      token,
    );
    if (!result.contentBytes)
      throw new Error("Ce type de pièce jointe Microsoft n’est pas encore pris en charge.");
    return { meta, bytes: Buffer.from(result.contentBytes, "base64") };
  }

  async reply(messageId: string, body: string) {
    const message = this.store.mail.getMessage(messageId);
    const account = this.account(message.accountId);
    const token = await this.oauth.accessToken(account.id);
    if (!body.trim()) throw new Error("La réponse est vide.");
    if (account.provider === "microsoft") {
      await request<void>(
        "Microsoft Graph",
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.providerMessageId)}/reply`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ comment: body.trim() }),
        },
      );
      return;
    }
    const subject = /^re:/i.test(message.subject)
      ? message.subject
      : `Re: ${message.subject}`;
    const headers = [
      `From: ${account.email}`,
      `To: ${message.from.email}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
    ];
    if (message.internetMessageId) {
      headers.push(`In-Reply-To: ${message.internetMessageId}`);
      headers.push(`References: ${message.internetMessageId}`);
    }
    const raw = Buffer.from(headers.join("\r\n") + "\r\n\r\n" + body.trim())
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    await request<void>(
      "Gmail",
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      token,
      {
        method: "POST",
        body: JSON.stringify({ raw, threadId: message.threadId ?? undefined }),
      },
    );
  }
}
