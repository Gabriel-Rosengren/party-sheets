import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CampaignSummary } from '@party-sheets/shared';
import { useCurrentUser } from '../auth/AuthContext';
import { api, ApiRequestError } from '../lib/api';
import { FullPageSpinner } from '../components/Layout';

function errorMessage(err: unknown) {
  if (err instanceof ApiRequestError) return Object.values(err.fieldErrors)[0] ?? err.message;
  return 'Something went wrong';
}

export function DashboardPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  useEffect(() => {
    api
      .listCampaigns()
      .then(({ campaigns }) => setCampaigns(campaigns))
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('create');
    setCreateError(null);
    try {
      const { campaign } = await api.createCampaign({ name });
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setCreateError(errorMessage(err));
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('join');
    setJoinError(null);
    try {
      const { campaign } = await api.joinCampaign({ inviteCode });
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setJoinError(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl text-stone-100">Hail, {user.displayName}</h1>
        <p className="mt-1 text-stone-400">Pick up a campaign, start a new one, or join your party.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={create} className="card space-y-3 p-5">
          <h2 className="font-display text-lg text-amber-400">Run a campaign</h2>
          <p className="text-sm text-stone-400">You'll be the DM and get an invite code to share.</p>
          <label htmlFor="campaign-name" className="sr-only">Campaign name</label>
          <input id="campaign-name" className="input" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          {createError && <p className="text-sm text-red-400">{createError}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy !== null || name.trim().length < 2}>
            {busy === 'create' ? 'Creating…' : 'Create campaign'}
          </button>
        </form>

        <form onSubmit={join} className="card space-y-3 p-5">
          <h2 className="font-display text-lg text-amber-400">Join a party</h2>
          <p className="text-sm text-stone-400">Enter the 6-character code from your DM.</p>
          <label htmlFor="invite-code" className="sr-only">Invite code</label>
          <input
            id="invite-code"
            className="input font-mono tracking-[0.3em] uppercase"
            placeholder="ABC234"
            value={inviteCode}
            maxLength={6}
            autoComplete="off"
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          {joinError && <p className="text-sm text-red-400">{joinError}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy !== null || inviteCode.trim().length !== 6}>
            {busy === 'join' ? 'Joining…' : 'Join campaign'}
          </button>
        </form>
      </div>

      <section>
        <h2 className="mb-4 font-display text-xl text-stone-100">Your campaigns</h2>
        {loadError && <p className="text-red-400">{loadError}</p>}
        {!campaigns && !loadError && <FullPageSpinner />}
        {campaigns?.length === 0 && (
          <p className="card p-6 text-center text-stone-400">No campaigns yet. Create one or join with a code above.</p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns?.map((c) => (
            <li key={c.id}>
              <Link to={`/campaigns/${c.id}`} className="card block p-5 transition hover:border-stone-600">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg text-stone-100">{c.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.role === 'DM' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                    }`}
                  >
                    {c.role === 'DM' ? 'DM' : 'Player'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-400">
                  DM {c.dmName} · {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
