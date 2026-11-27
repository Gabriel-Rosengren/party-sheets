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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => ({}))) as Partial<ApiError> & T;
  if (!res.ok)
    throw new ApiRequestError(res.status, json.error ?? res.statusText, json.issues, json);
  return json;
}

export const api = {
  me: () => request<{ user: PublicUser }>('GET', '/auth/me'),
  register: (input: RegisterInput) =>
    request<{ user: PublicUser }>('POST', '/auth/register', input),
  login: (input: LoginInput) => request<{ user: PublicUser }>('POST', '/auth/login', input),
  logout: () => request<void>('POST', '/auth/logout'),

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
