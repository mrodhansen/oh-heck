import type { GameDetail } from '../api';
import {
  assertCastMessageSize,
  CAST_NAMESPACE,
  toCastBoardMessage,
} from './snapshot';

function framework(): NonNullable<Window['cast']>['framework'] {
  const fw = window.cast?.framework;
  if (!fw) {
    throw new Error('Cast framework not loaded');
  }
  return fw;
}

export function loadCastSender(): Promise<void> {
  if (window.cast?.framework) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const previous = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (available) => {
      previous?.(available);
      if (available) resolve();
      else reject(new Error('Cast API unavailable'));
    };
    const existing = document.querySelector(
      'script[data-oh-heck-cast-sender]',
    );
    if (existing) return;
    const script = document.createElement('script');
    script.src =
      'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.dataset.ohHeckCastSender = '1';
    script.onerror = () => reject(new Error('Failed to load Cast sender'));
    document.head.appendChild(script);
  });
}

let readyAppId: string | null = null;

export async function initCast(appId: string): Promise<void> {
  if (!appId) {
    throw new Error('Missing Cast app id');
  }
  await loadCastSender();
  if (readyAppId === appId) return;
  const autoJoin = window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED;
  framework().CastContext.getInstance().setOptions({
    receiverApplicationId: appId,
    ...(autoJoin ? { autoJoinPolicy: autoJoin } : {}),
  });
  readyAppId = appId;
}

export function currentCastSession(): CastSessionLike | null {
  if (!window.cast?.framework) return null;
  return window.cast.framework.CastContext.getInstance().getCurrentSession();
}

export async function startCastSession(appId: string): Promise<void> {
  await initCast(appId);
  const ctx = framework().CastContext.getInstance();
  if (ctx.getCurrentSession()) return;
  await ctx.requestSession();
}

export async function sendCastBoard(game: GameDetail): Promise<void> {
  const session = currentCastSession();
  if (!session) return;
  const message = toCastBoardMessage(game);
  assertCastMessageSize(message);
  await session.sendMessage(CAST_NAMESPACE, message);
}
