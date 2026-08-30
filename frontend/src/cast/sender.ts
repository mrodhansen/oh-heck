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
  if (window.__ohHeckCastAvailable === false) {
    return Promise.reject(new Error('Cast API unavailable'));
  }
  return new Promise((resolve, reject) => {
    const previous = window.__ohHeckOnCastReady;
    window.__ohHeckOnCastReady = (available) => {
      previous?.(available);
      if (available && window.cast?.framework) resolve();
      else reject(new Error('Cast API unavailable'));
    };
    if (window.cast?.framework) {
      resolve();
      return;
    }
    if (window.__ohHeckCastAvailable === false) {
      reject(new Error('Cast API unavailable'));
    }
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
    androidReceiverCompatible: true,
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
