/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CAST_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type CastSessionLike = {
  sendMessage(namespace: string, message: object): Promise<void>;
  endSession(stopCasting: boolean): void;
};

type CastContextLike = {
  setOptions(opts: {
    receiverApplicationId: string;
    autoJoinPolicy?: string;
    androidReceiverCompatible?: boolean;
  }): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSessionLike | null;
};

type CastFrameworkLike = {
  CastContext: {
    getInstance(): CastContextLike;
  };
};

interface Window {
  cast?: { framework: CastFrameworkLike };
  chrome?: {
    cast?: { AutoJoinPolicy?: { ORIGIN_SCOPED: string } };
  };
  __onGCastApiAvailable?: (available: boolean) => void;
  __ohHeckCastAvailable?: boolean;
  __ohHeckOnCastReady?: (available: boolean) => void;
}
