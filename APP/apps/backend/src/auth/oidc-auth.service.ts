import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthSession } from './auth-session.types';
import { JwtPayload } from '../common/jwt-payload.interface';
import { SessionTokenService } from './session-token.service';
import { resolveBootstrapRole } from './user-role-policy';
import { renderOidcRelayPage } from './oidc-relay';

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

interface OidcStatePayload extends JWTPayload {
  purpose: 'oidc-login';
  nonce: string;
  codeVerifier: string;
}

interface VerifiedOidcClaims extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  nonce?: string;
  preferred_username?: string;
  email_verified?: boolean;
}

interface OidcRedirectResult {
  redirectUrl: string;
  session?: AuthSession;
}

function createPkceCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function createPkceCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

@Injectable()
export class OidcAuthService {
  private readonly logger = new Logger(OidcAuthService.name);
  private readonly adminEmails: Set<string>;
  private readonly bootstrapSuperAdminEmail: string | null;
  private readonly frontendAppBaseUrl: string;
  private readonly oidcScopes: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly sessionTokenService: SessionTokenService,
  ) {
    const adminEmails = this.configService.get<string>('ADMIN_EMAILS') ?? '';
    this.adminEmails = new Set(
      adminEmails
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    );
    this.bootstrapSuperAdminEmail =
      this.configService.get<string>('BOOTSTRAP_SUPER_ADMIN_EMAIL')?.trim().toLowerCase() || null;
    this.frontendAppBaseUrl = this.configService.getOrThrow<string>('APP_BASE_URL');
    this.oidcScopes = this.configService.get<string>('OIDC_SCOPES')?.trim() || 'openid profile email';
  }

  async createOidcLoginUrl(): Promise<string> {
    try {
      return await this.createOidcLoginUrlOrThrow();
    } catch (error) {
      this.logger.warn('oidc_login_start_failed');
      this.logger.warn(
        error instanceof Error ? { message: error.message } : { message: 'Unknown OIDC login start error.' },
      );
      return this.buildFrontendAuthErrorRedirect(this.resolveOidcCallbackErrorCode(error));
    }
  }

  renderOidcImplicitRelayPage(): string {
    return renderOidcRelayPage();
  }

  async completeOidcLogin(
    code: string | undefined,
    state: string | undefined,
    oidcError: string | undefined,
  ): Promise<OidcRedirectResult> {
    if (oidcError) {
      return { redirectUrl: this.buildFrontendAuthErrorRedirect(`oidc_${oidcError}`) };
    }

    if (!code || !state) {
      return { redirectUrl: this.buildFrontendAuthErrorRedirect('oidc_callback_missing_code_or_state') };
    }

    try {
      const settings = this.getOidcSettings();
      const statePayload = await this.jwtService.verifyAsync<OidcStatePayload>(state, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (statePayload.purpose !== 'oidc-login' || !statePayload.nonce || !statePayload.codeVerifier) {
        throw new UnauthorizedException('OIDC state is invalid.');
      }

      const discovery = await this.fetchOidcDiscoveryDocument(settings.issuer);
      const tokenSet = await this.exchangeOidcAuthorizationCode({
        code,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        codeVerifier: statePayload.codeVerifier,
        redirectUri: settings.redirectUri,
        tokenEndpoint: discovery.token_endpoint,
      });

      if (!tokenSet.id_token) {
        throw new UnauthorizedException('OIDC provider did not return an id_token.');
      }

      const claims = await this.verifyOidcIdToken({
        idToken: tokenSet.id_token,
        issuer: settings.issuer,
        clientId: settings.clientId,
        jwksUri: discovery.jwks_uri,
        nonce: statePayload.nonce,
      });

      const email = this.normalizeEmail(claims.email ?? '');
      if (!email) {
        throw new BadRequestException('OIDC provider did not return a usable email.');
      }

      const user = await this.findOrCreateOidcUser({
        provider: 'synology',
        subject: claims.sub,
        email,
        displayName: this.resolveOidcDisplayName(claims),
        emailVerified: claims.email_verified === true,
      });

      const session = await this.sessionTokenService.createSession(user);
      return {
        redirectUrl: this.buildFrontendSessionRedirect(),
        session,
      };
    } catch (error) {
      this.logger.warn('oidc_login_failed');
      this.logger.warn(
        error instanceof Error ? { message: error.message } : { message: 'Unknown OIDC callback error.' },
      );
      return { redirectUrl: this.buildFrontendAuthErrorRedirect(this.resolveOidcCallbackErrorCode(error)) };
    }
  }

  async completeOidcImplicitLogin(input: {
    accessToken?: string;
    idToken?: string;
    state?: string;
    error?: string;
  }): Promise<OidcRedirectResult> {
    if (input.error) {
      return { redirectUrl: this.buildFrontendAuthErrorRedirect(`oidc_${input.error}`) };
    }

    if (!input.idToken || !input.state) {
      return { redirectUrl: this.buildFrontendAuthErrorRedirect('oidc_callback_missing_code_or_state') };
    }

    try {
      const settings = this.getOidcSettings();
      const statePayload = await this.jwtService.verifyAsync<OidcStatePayload>(input.state, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (statePayload.purpose !== 'oidc-login' || !statePayload.nonce) {
        throw new UnauthorizedException('OIDC state is invalid.');
      }

      const discovery = await this.fetchOidcDiscoveryDocument(settings.issuer);
      const claims = await this.verifyOidcIdToken({
        idToken: input.idToken,
        issuer: settings.issuer,
        clientId: settings.clientId,
        jwksUri: discovery.jwks_uri,
        nonce: statePayload.nonce,
      });

      const userInfo = await this.fetchOidcUserInfo(discovery.userinfo_endpoint, input.accessToken);
      const email = this.normalizeEmail(claims.email ?? userInfo.email ?? '');
      if (!email) {
        throw new BadRequestException('OIDC provider did not return a usable email.');
      }

      const user = await this.findOrCreateOidcUser({
        provider: 'synology',
        subject: claims.sub,
        email,
        displayName: userInfo.displayName || this.resolveOidcDisplayName(claims),
        emailVerified: claims.email_verified === true || userInfo.emailVerified,
      });

      const session = await this.sessionTokenService.createSession(user);
      return {
        redirectUrl: this.buildFrontendSessionRedirect(),
        session,
      };
    } catch (error) {
      this.logger.warn('oidc_implicit_login_failed');
      this.logger.warn(
        error instanceof Error ? { message: error.message } : { message: 'Unknown OIDC implicit callback error.' },
      );
      return { redirectUrl: this.buildFrontendAuthErrorRedirect(this.resolveOidcCallbackErrorCode(error)) };
    }
  }

  private async createOidcLoginUrlOrThrow(): Promise<string> {
    const settings = this.getOidcSettings();
    const discovery = await this.fetchOidcDiscoveryDocument(settings.issuer);
    const nonce = randomBytes(16).toString('hex');
    const codeVerifier = createPkceCodeVerifier();
    const state = await this.jwtService.signAsync(
      {
        purpose: 'oidc-login',
        nonce,
        codeVerifier,
      } satisfies OidcStatePayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '10m',
      },
    );

    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.searchParams.set('client_id', settings.clientId);
    authorizeUrl.searchParams.set('response_type', 'id_token token');
    authorizeUrl.searchParams.set('scope', this.oidcScopes);
    authorizeUrl.searchParams.set('redirect_uri', settings.redirectUri);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('nonce', nonce);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('code_challenge', createPkceCodeChallenge(codeVerifier));

    return authorizeUrl.toString();
  }

  private async findOrCreateOidcUser(input: {
    provider: string;
    subject: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
  }) {
    const existingByOidc = await this.prismaService.user.findFirst({
      where: {
        oidcProvider: input.provider,
        oidcSubject: input.subject,
      },
    });

    if (existingByOidc) {
      const conflictingEmailOwner =
        existingByOidc.email !== input.email
          ? await this.prismaService.user.findUnique({
              where: { email: input.email },
              select: { id: true },
            })
          : null;

      if (conflictingEmailOwner && conflictingEmailOwner.id !== existingByOidc.id) {
        throw new ForbiddenException('OIDC email is already used by another local account.');
      }

      if (existingByOidc.disabledAt) {
        throw new ForbiddenException('该账号已停用，请联系管理员');
      }

      return this.prismaService.user.update({
        where: { id: existingByOidc.id },
        data: {
          email: input.email,
          displayName: input.displayName,
          emailVerifiedAt: input.emailVerified ? new Date() : existingByOidc.emailVerifiedAt,
        },
      });
    }

    const existingByEmail = await this.prismaService.user.findUnique({
      where: { email: input.email },
    });

    if (existingByEmail) {
      if (existingByEmail.disabledAt) {
        throw new ForbiddenException('该账号已停用，请联系管理员');
      }

      if (
        existingByEmail.oidcProvider &&
        existingByEmail.oidcSubject &&
        (existingByEmail.oidcProvider !== input.provider || existingByEmail.oidcSubject !== input.subject)
      ) {
        throw new ForbiddenException('Email is already linked to another OIDC identity.');
      }

      return this.prismaService.user.update({
        where: { id: existingByEmail.id },
        data: {
          oidcProvider: input.provider,
          oidcSubject: input.subject,
          displayName: input.displayName || existingByEmail.displayName,
          emailVerifiedAt: input.emailVerified ? new Date() : existingByEmail.emailVerifiedAt,
        },
      });
    }

    const totalUsers = await this.prismaService.user.count();
    return this.prismaService.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        oidcProvider: input.provider,
        oidcSubject: input.subject,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        role: resolveBootstrapRole(totalUsers, input.email, this.adminEmails, this.bootstrapSuperAdminEmail),
      },
    });
  }

  private async fetchOidcDiscoveryDocument(issuer: string): Promise<OidcDiscoveryDocument> {
    const discoveryUrl = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`);
    const response = await fetch(discoveryUrl.toString());

    if (!response.ok) {
      throw new BadRequestException(`Failed to load OIDC discovery document from ${discoveryUrl.toString()}.`);
    }

    const payload = (await response.json()) as Partial<OidcDiscoveryDocument>;
    if (
      !payload.authorization_endpoint ||
      !payload.issuer ||
      !payload.jwks_uri ||
      !payload.token_endpoint ||
      !payload.userinfo_endpoint
    ) {
      throw new BadRequestException('OIDC discovery document is incomplete.');
    }

    return payload as OidcDiscoveryDocument;
  }

  private async exchangeOidcAuthorizationCode(input: {
    code: string;
    clientId: string;
    clientSecret: string;
    codeVerifier: string;
    redirectUri: string;
    tokenEndpoint: string;
  }): Promise<{ id_token?: string }> {
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    });

    const basicAuthResponse = await this.postOidcTokenRequest(input.tokenEndpoint, requestBody, {
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    this.logOidcTokenExchangeAttempt('client_secret_basic', basicAuthResponse);

    if (basicAuthResponse.ok) {
      return basicAuthResponse.payload ?? {};
    }

    const postAuthBody = new URLSearchParams(requestBody);
    postAuthBody.set('client_id', input.clientId);
    postAuthBody.set('client_secret', input.clientSecret);

    const postAuthResponse = await this.postOidcTokenRequest(input.tokenEndpoint, postAuthBody, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    this.logOidcTokenExchangeAttempt('client_secret_post', postAuthResponse);

    if (postAuthResponse.ok) {
      return postAuthResponse.payload ?? {};
    }

    const noPkceBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    });

    const noPkceResponse = await this.postOidcTokenRequest(input.tokenEndpoint, noPkceBody, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    this.logOidcTokenExchangeAttempt('client_secret_post_no_pkce', noPkceResponse);

    if (noPkceResponse.ok) {
      return noPkceResponse.payload ?? {};
    }

    throw new UnauthorizedException(
      noPkceResponse.payload?.error ??
        postAuthResponse.payload?.error ??
        basicAuthResponse.payload?.error ??
        'OIDC code exchange failed.',
    );
  }

  private async postOidcTokenRequest(
    tokenEndpoint: string,
    body: URLSearchParams,
    headers: Record<string, string>,
  ): Promise<{
    ok: boolean;
    status: number;
    payload: { id_token?: string; error?: string } | null;
    rawBody: string | null;
  }> {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    const rawBody = await response.text().catch(() => '');
    const payload = (rawBody ? JSON.parse(rawBody) : null) as { id_token?: string; error?: string } | null;

    return {
      ok: response.ok,
      status: response.status,
      payload,
      rawBody: rawBody || null,
    };
  }

  private logOidcTokenExchangeAttempt(
    method: string,
    result: {
      ok: boolean;
      status: number;
      payload: { id_token?: string; error?: string } | null;
      rawBody: string | null;
    },
  ): void {
    if (result.ok) {
      return;
    }

    this.logger.warn('oidc_token_exchange_failed');
    this.logger.warn({
      method,
      status: result.status,
      error: result.payload?.error ?? null,
      rawBody: result.rawBody,
    });
  }

  private async verifyOidcIdToken(input: {
    idToken: string;
    issuer: string;
    clientId: string;
    jwksUri: string;
    nonce: string;
  }): Promise<VerifiedOidcClaims> {
    const jwks = createRemoteJWKSet(new URL(input.jwksUri));
    const verified = await jwtVerify(input.idToken, jwks, {
      issuer: input.issuer,
      audience: input.clientId,
    });

    if (!verified.payload.sub) {
      throw new UnauthorizedException('OIDC id_token is missing sub.');
    }

    if (verified.payload.nonce !== input.nonce) {
      throw new UnauthorizedException('OIDC id_token nonce mismatch.');
    }

    return verified.payload as VerifiedOidcClaims;
  }

  private resolveOidcDisplayName(claims: VerifiedOidcClaims): string {
    return claims.name?.trim() || claims.preferred_username?.trim() || claims.email?.split('@')[0]?.trim() || 'User';
  }

  private async fetchOidcUserInfo(
    userInfoEndpoint: string,
    accessToken: string | undefined,
  ): Promise<{
    email?: string;
    displayName: string;
    emailVerified: boolean;
  }> {
    if (!accessToken) {
      return {
        email: undefined,
        displayName: 'User',
        emailVerified: false,
      };
    }

    const response = await fetch(userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          email?: string;
          username?: string;
          email_verified?: boolean;
        }
      | null;

    if (!response.ok || !payload) {
      this.logger.warn('oidc_userinfo_request_failed');
      this.logger.warn({
        status: response.status,
        hasAccessToken: Boolean(accessToken),
      });
      return {
        email: undefined,
        displayName: 'User',
        emailVerified: false,
      };
    }

    return {
      email: payload.email,
      displayName: payload.username?.trim() || payload.email?.split('@')[0]?.trim() || 'User',
      emailVerified: payload.email_verified === true,
    };
  }

  private buildFrontendSessionRedirect(): string {
    const url = new URL(this.frontendAppBaseUrl);
    return url.toString();
  }

  private buildFrontendAuthErrorRedirect(message: string): string {
    const url = new URL(this.frontendAppBaseUrl);
    url.hash = new URLSearchParams({
      authError: message,
    }).toString();
    return url.toString();
  }

  private resolveOidcCallbackErrorCode(error: unknown): string {
    if (error instanceof ForbiddenException) {
      return 'oidc_forbidden';
    }

    if (error instanceof UnauthorizedException) {
      return 'oidc_unauthorized';
    }

    if (error instanceof BadRequestException) {
      return 'oidc_bad_request';
    }

    return 'oidc_callback_failed';
  }

  private getOidcSettings(): {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const issuer = this.configService.get<string>('OIDC_ISSUER')?.trim();
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID')?.trim();
    const clientSecret = this.configService.get<string>('OIDC_CLIENT_SECRET')?.trim();
    const redirectUri = this.configService.get<string>('OIDC_REDIRECT_URI')?.trim();

    if (!issuer || !clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('OIDC is not configured.');
    }

    return {
      issuer,
      clientId,
      clientSecret,
      redirectUri,
    };
  }
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
