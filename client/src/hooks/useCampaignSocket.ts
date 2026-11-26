import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@party-sheets/shared';

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

  useEffect(() => {
    // Same origin as the page; the Vite dev server proxies /socket.io to the API.
    const socket: CampaignSocket = io({ withCredentials: true });
    let hasConnectedBefore = false;

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
    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));

    socket.on('sheet:updated', (sheet) => handlersRef.current['sheet:updated']?.(sheet));
    socket.on('member:joined', (p) => handlersRef.current['member:joined']?.(p));
    socket.on('presence:update', (p) => handlersRef.current['presence:update']?.(p));

    return () => {
      socket.emit('campaign:leave', { campaignId });
      socket.disconnect();
    };
  }, [campaignId]);

  return status;
}
