const CHANNEL = 'rabbit-sound';
const BEAT_MS = 4000;
const STALE_MS = 12000;

export interface Peer { id: string; openedAt: number; visible: boolean }

/**
 * Of the open tabs, the one that plays a sound: a visible tab if there is one, otherwise the oldest.
 * Ties go to the lower id, so every tab reaches the same answer without talking to the others.
 */
export function pickLeader(peers: Peer[], selfId: string): boolean {
  const visible = peers.filter(p => p.visible);
  const pool = visible.length ? visible : peers;
  const first = [...pool].sort((a, b) => a.openedAt - b.openedAt || a.id.localeCompare(b.id))[0];
  return first?.id === selfId;
}

/** Keeps a live list of the app's open tabs, so exactly one of them plays a sound (not one per tab). */
export function startTabLeader() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const openedAt = Date.now();
  const peers = new Map<string, Peer & { seen: number }>();
  const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = ({ data }) => {
      if (data.gone) peers.delete(data.id);
      else peers.set(data.id, { ...data, seen: Date.now() });
    };
  } catch { channel = null; }

  const announce = () => {
    const me: Peer = { id, openedAt, visible: isVisible() };
    peers.set(id, { ...me, seen: Date.now() });
    channel?.postMessage(me);
  };
  const live = () => {
    const cutoff = Date.now() - STALE_MS;
    for (const [pid, p] of peers) if (pid !== id && p.seen < cutoff) peers.delete(pid);
    return [...peers.values()];
  };

  announce();
  const timer = setInterval(announce, BEAT_MS);
  const onHide = () => channel?.postMessage({ id, gone: true });
  document.addEventListener('visibilitychange', announce);
  window.addEventListener('pagehide', onHide);

  return {
    isLeader: () => pickLeader(live(), id),
    destroy() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', announce);
      window.removeEventListener('pagehide', onHide);
      channel?.close();
    },
  };
}
