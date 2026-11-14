export interface AvatarSessionCallbacks {
  caption(role: 'user' | 'coach', text: string, itemId: string): void;
  tool(callId: string, name: string, args: string): void;
  speaking(on: boolean): void;
  disconnected(): void;
}

export interface AvatarSession {
  start(): Promise<void>;
  attach(element: HTMLVideoElement): void;
  setMuted(muted: boolean): Promise<void>;
  sendToolResult(callId: string, result: string): void;
  stop(): Promise<void>;
}

export type AvatarSessionFactory = (token: string, callbacks: AvatarSessionCallbacks) => Promise<AvatarSession>;
