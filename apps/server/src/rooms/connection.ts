// Transport abstraction so room logic can be tested without real sockets.

export type Connection = {
  readonly id: string;
  send(data: string): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  close(code: number, reason: string): void;
};

export type Hub = {
  /** Sends data to every connection subscribed to the topic. */
  publish(topic: string, data: string): void;
};

/** WebSocket close codes used by the game. 1000 from the client means "left on purpose". */
export const CLOSE_NORMAL = 1000;
export const CLOSE_PROTOCOL_ERROR = 4000;
export const CLOSE_REPLACED = 4001;
