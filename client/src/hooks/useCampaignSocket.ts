import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, SocketAuth } from '@party-sheets/shared';
import { useCurrentUser } from '../auth/AuthContext';
import { notifySessionLost } from '../lib/api';

type CampaignSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

type Handlers = Partial<{
  [E in keyof ServerToClientEvents]: ServerToClientEvents[E];
}> & {
  /** Fired after a reconnect, so the page can refetch anything it may have missed. */
  onResync?: () => void;
};

/**
 * Opens a socket for the lifetime of a campaign page and subscribes to its room.
 * Handlers are read through a ref, so callers can pass inline functions freely.
 */
export function useCampaignSocket(campaignId: string, handlers: Handlers) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const accountId = useCurrentUser().id;

  useEffect(() => {
    // Same origin as the page; the Vite dev server proxies /socket.io to the API.
    // The handshake names this tab's account, like the X-Account header on REST calls.
    const auth: SocketAuth = { accountId };
    const socket: CampaignSocket = io({ withCredentials: true, auth });
    let hasConnectedBefore = false;

    const sessionLost = () => {
      setStatus('error');
      notifySessionLost();
    };

    socket.on('connect', () => {
      socket.emit('campaign:join', { campaignId }, (res) => {
        if (!res.ok) {
          setStatus('error');
          return;
        }
        setStatus('live');
        if (hasConnectedBefore) handlersRef.current.onResync?.();
        hasConnectedBefore = true;
      });
    });
    socket.on('disconnect', (reason) => {
      // The server only closes a socket itself when its session was signed out.
      if (reason === 'io server disconnect') sessionLost();
      else setStatus('reconnecting');
    });
    socket.on('connect_error', (err) => {
      // The server rejects the handshake with 'unauthorized' when the session is gone.
      if (err.message === 'unauthorized') sessionLost();
      else setStatus('reconnecting');
    });

    socket.on('sheet:updated', (sheet) => handlersRef.current['sheet:updated']?.(sheet));
    socket.on('member:joined', (joined) => handlersRef.current['member:joined']?.(joined));
    socket.on('presence:update', (presence) => handlersRef.current['presence:update']?.(presence));

    return () => {
      socket.emit('campaign:leave', { campaignId });
      socket.disconnect();
    };
  }, [campaignId, accountId]);

  return status;
}
