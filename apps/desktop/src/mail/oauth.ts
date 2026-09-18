import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { safeStorage, shell } from "electron";
import type { SqliteDataStore } from "../../../../packages/data/src/sqlite";
import type { MailAccount, MailProvider } from "@taskflow/core";

type Tokens = {
  provider: MailProvider;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
};

type ProviderConfig = {
  clientId: string;
  clientSecret?: string;
  authorize: string;
  token: string;
  scopes: string[];
};

const configs = (): Record<MailProvider, ProviderConfig> => ({
  google: {
    clientId: process.env.TASKFLOW_GOOGLE_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.TASKFLOW_GOOGLE_CLIENT_SECRET?.trim() || undefined,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  },
  microsoft: {
    clientId: process.env.TASKFLOW_MICROSOFT_CLIENT_ID?.trim() ?? "",
    authorize:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Mail.ReadWrite",
      "Mail.Send",
    ],
  },
});

function b64url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) {
    let detail = body.slice(0, 500);
    try {
      const parsed = JSON.parse(body) as {
        error?: string;
        error_description?: string;
        message?: string;
      };
      detail =
        parsed.error_description ?? parsed.message ?? parsed.error ?? detail;
    } catch {}
    throw new Error(`Connexion mail refusée : ${detail || response.status}`);
  }
  return JSON.parse(body) as T;
}

export class MailOAuth {
  private readonly directory: string;

  constructor(
    private readonly store: SqliteDataStore,
    userData: string,
  ) {
    this.directory = join(userData, "mail-secrets");
  }

  status() {
    const c = configs();
    return {
      googleConfigured: !!c.google.clientId,
      microsoftConfigured: !!c.microsoft.clientId,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    };
  }

  private async tokenPath(accountId: string) {
    await mkdir(this.directory, { recursive: true });
    return join(this.directory, `${accountId}.bin`);
  }

  private async saveTokens(accountId: string, tokens: Tokens) {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        "Le stockage sécurisé Windows n’est pas disponible. Connexion mail annulée.",
      );
    const path = await this.tokenPath(accountId);
    await writeFile(path, safeStorage.encryptString(JSON.stringify(tokens)), {
      mode: 0o600,
    });
  }

  async loadTokens(accountId: string): Promise<Tokens> {
    const path = await this.tokenPath(accountId);
    const encrypted = await readFile(path);
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Le stockage sécurisé Windows n’est pas disponible.");
    return JSON.parse(safeStorage.decryptString(encrypted)) as Tokens;
  }

  async disconnect(accountId: string) {
    this.store.mail.removeAccount(accountId);
    await rm(await this.tokenPath(accountId), { force: true });
  }

  async accessToken(accountId: string) {
    const current = await this.loadTokens(accountId);
    if (current.expiresAt > Date.now() + 60_000) return current.accessToken;
    if (!current.refreshToken)
      throw new Error("La session mail a expiré. Reconnectez ce compte.");
    const config = configs()[current.provider];
    if (!config.clientId)
      throw new Error("L’identifiant OAuth de ce fournisseur n’est plus configuré.");
    const form = new URLSearchParams({
      client_id: config.clientId,
      refresh_token: current.refreshToken,
      grant_type: "refresh_token",
    });
    if (current.provider === "microsoft")
      form.set("scope", config.scopes.join(" "));
    if (config.clientSecret) form.set("client_secret", config.clientSecret);
    const refreshed = await json<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(config.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    await this.saveTokens(accountId, {
      ...current,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? current.refreshToken,
      expiresAt: Date.now() + Math.max(60, refreshed.expires_in ?? 3600) * 1000,
      scope: refreshed.scope ?? current.scope,
    });
    return refreshed.access_token;
  }

  async connect(provider: MailProvider): Promise<MailAccount> {
    const config = configs()[provider];
    if (!config.clientId)
      throw new Error(
        provider === "google"
          ? "TASKFLOW_GOOGLE_CLIENT_ID n’est pas configuré."
          : "TASKFLOW_MICROSOFT_CLIENT_ID n’est pas configuré.",
      );
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        "Le stockage sécurisé Windows n’est pas disponible. Connexion mail annulée.",
      );

    const verifier = b64url(randomBytes(64)).slice(0, 96);
    const challenge = b64url(
      createHash("sha256").update(verifier, "ascii").digest(),
    );
    const state = b64url(randomBytes(32));

    const callback = await new Promise<{
      code: string;
      redirectUri: string;
    }>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, value?: { code: string; redirectUri: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.close();
        if (error) reject(error);
        else resolve(value!);
      };
      const server = createServer((req, res) => {
        const port = (server.address() as { port: number }).port;
        const callbackPath = provider === "microsoft" ? "/" : "/oauth/callback";
        const host = provider === "microsoft" ? "localhost" : "127.0.0.1";
        const base = `http://${host}:${port}`;
        const url = new URL(req.url ?? "/", base);
        if (url.pathname !== callbackPath) {
          res.writeHead(404).end();
          return;
        }
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("TaskFlow : réponse OAuth invalide.");
          finish(new Error("Réponse OAuth invalide : état de sécurité incorrect."));
          return;
        }
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        if (error || !code) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Connexion TaskFlow annulée. Vous pouvez fermer cet onglet.");
          finish(new Error("Connexion mail annulée ou refusée."));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>TaskFlow</title><body><h1>Connexion réussie</h1><p>Vous pouvez fermer cet onglet et revenir dans TaskFlow.</p></body></html>",
        );
        finish(undefined, { code, redirectUri: base + callbackPath });
      });
      server.on("error", (e) => finish(e instanceof Error ? e : new Error(String(e))));
      const timer = setTimeout(
        () => finish(new Error("La connexion mail a expiré. Réessayez.")),
        5 * 60_000,
      );
      server.listen(0, "127.0.0.1", async () => {
        const address = server.address() as { port: number };
        const callbackPath = provider === "microsoft" ? "/" : "/oauth/callback";
        const host = provider === "microsoft" ? "localhost" : "127.0.0.1";
        const redirectUri = `http://${host}:${address.port}${callbackPath}`;
        const auth = new URL(config.authorize);
        auth.searchParams.set("client_id", config.clientId);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("redirect_uri", redirectUri);
        auth.searchParams.set("scope", config.scopes.join(" "));
        auth.searchParams.set("state", state);
        auth.searchParams.set("code_challenge", challenge);
        auth.searchParams.set("code_challenge_method", "S256");
        if (provider === "google") {
          auth.searchParams.set("access_type", "offline");
          auth.searchParams.set("prompt", "consent");
        } else {
          auth.searchParams.set("response_mode", "query");
        }
        try {
          await shell.openExternal(auth.toString());
        } catch (e) {
          finish(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });

    const form = new URLSearchParams({
      client_id: config.clientId,
      code: callback.code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: callback.redirectUri,
    });
    if (config.clientSecret) form.set("client_secret", config.clientSecret);
    const token = await json<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(config.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const profile =
      provider === "google"
        ? await json<{ email: string; name?: string }>(
            "https://openidconnect.googleapis.com/v1/userinfo",
            { headers: { Authorization: `Bearer ${token.access_token}` } },
          )
        : await json<{ mail?: string; userPrincipalName?: string; displayName?: string }>(
            "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
            { headers: { Authorization: `Bearer ${token.access_token}` } },
          );

    const email =
      provider === "google"
        ? (profile as { email: string }).email
        : ((profile as { mail?: string; userPrincipalName?: string }).mail ??
          (profile as { userPrincipalName?: string }).userPrincipalName ??
          "");
    if (!email) throw new Error("Impossible de déterminer l’adresse du compte.");

    const displayName =
      provider === "google"
        ? ((profile as { name?: string }).name ?? "")
        : ((profile as { displayName?: string }).displayName ?? "");
    const account = this.store.mail.saveAccount({
      provider,
      email,
      displayName,
    });
    await this.saveTokens(account.id, {
      provider,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
      scope: token.scope ?? config.scopes.join(" "),
    });
    return account;
  }
}
