export class BackgroundTasks {
  private readonly pending = new Set<Promise<void>>();

  // A rejected promise nobody awaits would crash the Node process, unlike on Workers.
  defer = (work: Promise<unknown>): void => {
    const task = work
      .then(() => undefined)
      .catch((err: unknown) => console.error('Background task failed', err))
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  };

  async drain(timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([Promise.allSettled([...this.pending]), timeout]);
    clearTimeout(timer);
  }
}
