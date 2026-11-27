import { ACCOUNT_HEADER } from '@party-sheets/shared';
import type {
  ApiError,
  CampaignDetail,
  CampaignSummary,
  CreateCampaignInput,
  JoinCampaignInput,
  LoginInput,
  PublicUser,
  RegisterInput,
  Sheet,
  SheetData,
} from '@party-sheets/shared';
import { tabAccount } from './tab-account';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: ApiError['issues'] = [],
    /** The full error body, for endpoints that return more than a message (e.g. 409s). */
    public readonly body: unknown = undefined,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Validation messages keyed by field path, for showing next to inputs. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.issues ?? []).map((i) => [i.path, i.message]));
  }
}

let onSessionLost: (() => void) | null = null;

/**
 * Called when this tab's account stops being signed in (signed out in another tab,
 * expired, or replaced by a newer sign-in beyond the account limit), so the app can go
 * back to the sign-in page instead of failing request by request.
 */
export const setSessionLostHandler = (handler: (() => void) | null) => {
  onSessionLost = handler;
};
export const notifySessionLost = () => onSessionLost?.();

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Every request names the account this tab acts as; see tab-account.ts.
  const headers: Record<string, string> = {};
  const account = tabAccount.get();
  if (account) headers[ACCOUNT_HEADER] = account;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => ({}))) as Partial<ApiError> & T;
  if (!res.ok) {
    if (res.status === 401 && account && !path.startsWith('/auth/')) notifySessionLost();
    throw new ApiRequestError(res.status, json.error ?? res.statusText, json.issues, json);
  }
  return json;
}

export const api = {
  me: () => request<{ user: PublicUser }>('GET', '/auth/me'),
  register: (input: RegisterInput) =>
    request<{ user: PublicUser }>('POST', '/auth/register', input),
  login: (input: LoginInput) => request<{ user: PublicUser }>('POST', '/auth/login', input),
  logout: () => request<void>('POST', '/auth/logout'),
  /** Accounts signed in on this browser, most recent first. */
  accounts: () => request<{ accounts: PublicUser[] }>('GET', '/auth/accounts'),

  listCampaigns: () => request<{ campaigns: CampaignSummary[] }>('GET', '/campaigns'),
  createCampaign: (input: CreateCampaignInput) =>
    request<{ campaign: { id: string } }>('POST', '/campaigns', input),
  joinCampaign: (input: JoinCampaignInput) =>
    request<{ campaign: { id: string }; alreadyMember: boolean }>('POST', '/campaigns/join', input),
  getCampaign: (id: string) => request<{ campaign: CampaignDetail }>('GET', `/campaigns/${id}`),
  getCampaignSheets: (id: string) => request<{ sheets: Sheet[] }>('GET', `/campaigns/${id}/sheets`),

  updateSheet: (id: string, data: SheetData, baseVersion: number) =>
    request<{ sheet: Sheet }>('PUT', `/sheets/${id}`, { data, baseVersion }),
};
