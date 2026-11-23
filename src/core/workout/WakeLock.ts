type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(t: 'release', fn: () => void): void };

export type WakeLockState = 'unsupported' | 'active' | 'released' | 'error';

/** 운동 중 화면 꺼짐 방지 (Screen Wake Lock API 지원 시) */
export class WakeLockController {
  private sentinel: Sentinel | null = null;
  private wanted = false;
  private _state: WakeLockState;
  private onVisibility = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };
  constructor(private onChange: (s: WakeLockState) => void = () => {}) {
    this._state = WakeLockController.supported() ? 'released' : 'unsupported';
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  get state(): WakeLockState {
    return this._state;
  }

  async enable(): Promise<void> {
    this.wanted = true;
    if (!WakeLockController.supported()) return;
    document.addEventListener('visibilitychange', this.onVisibility);
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    const s = this.sentinel;
    this.sentinel = null;
    if (s && !s.released) await s.release().catch(() => {});
    if (this._state !== 'unsupported') this.set('released');
  }

  private async acquire(): Promise<void> {
    if (this.sentinel && !this.sentinel.released) return;
    try {
      const wl = (navigator as unknown as { wakeLock: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
      this.sentinel = await wl.request('screen');
      this.sentinel.addEventListener('release', () => {
        if (this._state === 'active') this.set('released');
      });
      this.set('active');
    } catch {
      this.set('error');
    }
  }

  private set(s: WakeLockState): void {
    this._state = s;
    this.onChange(s);
  }
}
