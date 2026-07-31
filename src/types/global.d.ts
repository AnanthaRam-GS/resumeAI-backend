declare global {
  // eslint-disable-next-line no-var
  var wsEmitToUser: ((userId: string, event: Record<string, unknown>) => void) | undefined;
}

export {};
