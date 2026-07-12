let inFlight = 0;
const pending: Array<() => void> = [];
const MAX = 12;

export function acquirePreviewSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const start = () => {
      inFlight++;
      resolve(() => {
        inFlight--;
        const next = pending.shift();
        if (next) next();
      });
    };
    if (inFlight < MAX) start();
    else pending.push(start);
  });
}
