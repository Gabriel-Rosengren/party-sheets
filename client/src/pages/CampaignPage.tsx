import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { CampaignDetail, Sheet } from '@party-sheets/shared';
import { api, ApiRequestError } from '../lib/api';
import { useCampaignSocket, type ConnectionStatus } from '../hooks/useCampaignSocket';
import { FullPageSpinner } from '../components/Layout';
import { DmView } from './DmView';
import { PlayerView } from './PlayerView';

const STATUS_LABEL: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: 'Connecting…', dot: 'bg-stone-500' },
  live: { text: 'Live', dot: 'bg-emerald-400 animate-pulse' },
  reconnecting: { text: 'Reconnecting…', dot: 'bg-amber-400' },
  error: { text: 'Realtime unavailable', dot: 'bg-red-500' },
};

/** Keeps whichever copy of a sheet is newest; socket events can race REST responses. */
export const mergeSheet = (sheets: Sheet[], incoming: Sheet): Sheet[] => {
  const idx = sheets.findIndex((s) => s.id === incoming.id);
  if (idx === -1) return [...sheets, incoming];
  if ((sheets[idx]?.version ?? 0) >= incoming.version) return sheets;
  return sheets.map((s, i) => (i === idx ? incoming : s));
};

export function CampaignPage() {
  const { campaignId = '' } = useParams();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.getCampaign(campaignId), api.getCampaignSheets(campaignId)]);
      setCampaign(c.campaign);
      setSheets((prev) => s.sheets.reduce(mergeSheet, prev ?? []));
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 404 ? 'Campaign not found.' : 'Could not load campaign.');
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = useCampaignSocket(campaignId, {
    'sheet:updated': (sheet) => setSheets((prev) => (prev ? mergeSheet(prev, sheet) : prev)),
    'member:joined': ({ sheet }) => {
      setSheets((prev) => (prev ? mergeSheet(prev, sheet) : prev));
      // Refresh the member list (cheap, and keeps the roster authoritative).
      void api.getCampaign(campaignId).then((c) => setCampaign(c.campaign));
    },
    'presence:update': ({ online }) => setOnline(online),
    onResync: () => void load(),
  });

  if (error) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <p className="mb-4 text-stone-300">{error}</p>
        <Link to="/" className="btn btn-ghost">Back to campaigns</Link>
      </div>
    );
  }
  if (!campaign || !sheets) return <FullPageSpinner />;

  const live = STATUS_LABEL[status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="text-sm text-stone-400 hover:text-stone-200">← Campaigns</Link>
          <h1 className="mt-1 font-display text-3xl text-stone-100">{campaign.name}</h1>
          <p className="text-sm text-stone-400">
            {campaign.role === 'DM' ? 'You are the Dungeon Master' : 'Your character sheet'}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-stone-800 px-3 py-1 text-xs text-stone-300" role="status">
          <span className={`size-2 rounded-full ${live.dot}`} aria-hidden />
          {live.text}
        </span>
      </div>

      {campaign.role === 'DM' ? (
        <DmView campaign={campaign} sheets={sheets} online={online} />
      ) : (
        <PlayerView sheet={sheets[0]} />
      )}
    </div>
  );
}
