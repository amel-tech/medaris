import { MedarisError } from "@medaris/common";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IKeycloakAdminConfig } from "../config/keycloak-admin-env";

export class KeycloakAdminNotConfiguredError extends MedarisError {
  static readonly code = "KEYCLOAK_ADMIN_NOT_CONFIGURED";

  constructor() {
    super(
      KeycloakAdminNotConfiguredError.code,
      503,
      "The user directory is not available: KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET are not set on this server"
    );
  }
}

export class KeycloakAdminUnavailableError extends MedarisError {
  static readonly code = "KEYCLOAK_ADMIN_UNAVAILABLE";

  constructor() {
    super(
      KeycloakAdminUnavailableError.code,
      503,
      "The user directory did not answer"
    );
  }
}

export interface IDirectoryUser {
  id: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

interface IKeycloakUserRepresentation {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
}

export const KEYCLOAK_ADMIN_FETCH = Symbol("KEYCLOAK_ADMIN_FETCH");
export type FetchLike = typeof fetch;

/** Refresh the service token this long before it expires. */
const TOKEN_SKEW_MS = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Reads the realm's users through Keycloak's Admin REST API as a service
 * account (MDRS-169). The account needs `view-users`, `query-users` and
 * `view-realm` (for `/roles/:role/users`) from `realm-management` and nothing
 * more; see
 * `docs/migration/mdrs-169-atama-temeli.md`.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(KEYCLOAK_ADMIN_FETCH) private readonly fetchImpl: FetchLike
  ) {}

  private get settings(): IKeycloakAdminConfig {
    const admin = this.config.get<IKeycloakAdminConfig | null>(
      "keycloak.admin"
    );
    if (!admin) throw new KeycloakAdminNotConfiguredError();
    return admin;
  }

  isConfigured(): boolean {
    return Boolean(this.config.get("keycloak.admin"));
  }

  /** The account with exactly this e-mail address, or null. Never a prefix. */
  async findByExactEmail(email: string): Promise<IDirectoryUser | null> {
    const params = new URLSearchParams({ email, exact: "true", max: "2" });
    const found = await this.get<IKeycloakUserRepresentation[]>(
      `/users?${params.toString()}`
    );
    const user = (found ?? []).find((u) => u.enabled !== false);
    return user ? toDirectoryUser(user) : null;
  }

  /** The accounts that hold a realm role, or [] when the role does not exist. */
  async findByRealmRole(role: string): Promise<IDirectoryUser[]> {
    const found = await this.get<IKeycloakUserRepresentation[]>(
      `/roles/${encodeURIComponent(role)}/users?max=50`,
      { missingIs: [] }
    );
    return (found ?? [])
      .filter((u) => u.enabled !== false)
      .map(toDirectoryUser);
  }

  private async get<T>(
    path: string,
    options?: { missingIs: T }
  ): Promise<T | null> {
    const settings = this.settings;
    const send = async (): Promise<Response> =>
      this.fetchImpl(`${settings.adminUrl}${path}`, {
        headers: { Authorization: `Bearer ${await this.accessToken()}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    let response: Response;
    try {
      response = await send();
      if (response.status === 401) {
        this.token = null;
        response = await send();
      }
    } catch (error) {
      this.logger.warn(`Keycloak admin request failed: ${String(error)}`);
      throw new KeycloakAdminUnavailableError();
    }
    if (response.status === 404 && options) return options.missingIs;
    if (!response.ok) {
      this.logger.warn(
        `Keycloak admin answered ${response.status} for ${path.split("?")[0]}`
      );
      throw new KeycloakAdminUnavailableError();
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(
        `Keycloak admin body unreadable for ${path.split("?")[0]}: ${String(error)}`
      );
      throw new KeycloakAdminUnavailableError();
    }
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt - TOKEN_SKEW_MS > now) {
      return this.token.value;
    }
    const settings = this.settings;
    const response = await this.fetchImpl(settings.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`token endpoint answered ${response.status}`);
    }
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: body.access_token,
      expiresAt: now + body.expires_in * 1000,
    };
    return body.access_token;
  }
}

function toDirectoryUser(user: IKeycloakUserRepresentation): IDirectoryUser {
  return {
    id: user.id,
    givenName: user.firstName ?? null,
    familyName: user.lastName ?? null,
    email: user.email ?? null,
  };
}
