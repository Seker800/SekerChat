let audioContext: AudioContext | null = null;

const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
let isWarmupRegistered = false;
let lastWarmupAt = 0;

export function isSoundDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('debug:sound') === '1';
  } catch {
    return false;
  }
}

export function logSoundDebug(message: string, details?: Record<string, unknown>): void {
  if (!isSoundDebugEnabled()) {
    return;
  }

  if (details) {
    console.debug(`[sound] ${message}`, details);
    return;
  }

  console.debug(`[sound] ${message}`);
}

function canUseWebAudio(): boolean {
  return typeof window !== 'undefined' && typeof AudioCtor === 'function';
}

function observeAudioContext(context: AudioContext): void {
  context.addEventListener('statechange', () => {
    logSoundDebug('audio context state changed', { state: context.state });
  });
}

function createAudioContext(): AudioContext {
  const context = new AudioCtor();
  observeAudioContext(context);
  return context;
}

function resetAudioContext(): void {
  if (!audioContext) {
    return;
  }

  audioContext.close().catch(() => {});
  audioContext = null;
}

async function warmupAudio(): Promise<void> {
  if (!canUseWebAudio()) {
    logSoundDebug('warmup skipped: Web Audio unavailable');
    return;
  }

  const now = Date.now();
  if (now - lastWarmupAt < 250) {
    return;
  }
  lastWarmupAt = now;

  try {
    if (!audioContext || audioContext.state === 'closed') {
      resetAudioContext();
      audioContext = createAudioContext();
      logSoundDebug('audio context created during warmup', { state: audioContext.state });
    }

    if (audioContext.state !== 'running') {
      await audioContext.resume();
      logSoundDebug('audio context resumed during warmup', { state: audioContext.state });
    }
  } catch (error) {
    logSoundDebug('warmup failed', {
      error: error instanceof Error ? error.message : 'Unknown warmup error',
    });
  }
}

function registerWarmupListeners(): void {
  if (isWarmupRegistered || typeof document === 'undefined' || !canUseWebAudio()) {
    return;
  }

  isWarmupRegistered = true;
  document.addEventListener('click', () => { void warmupAudio(); });
  document.addEventListener('touchstart', () => { void warmupAudio(); });
  document.addEventListener('keydown', () => { void warmupAudio(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void warmupAudio();
    }
  });
  window.addEventListener('focus', () => { void warmupAudio(); });
}

async function getAudioContext(): Promise<AudioContext> {
  if (!canUseWebAudio()) {
    logSoundDebug('getAudioContext failed: Web Audio unavailable');
    throw new Error('Web Audio API is not supported in this browser.');
  }

  if (!audioContext) {
    registerWarmupListeners();
    audioContext = createAudioContext();
    logSoundDebug('audio context lazily created', { state: audioContext.state });
  }

  if (audioContext.state === 'closed') {
    logSoundDebug('audio context closed, recreating');
    resetAudioContext();
    audioContext = createAudioContext();
  }

  if (audioContext.state === 'suspended' || audioContext.state === 'interrupted') {
    logSoundDebug('audio context not running, attempting resume', { state: audioContext.state });
    try {
      await audioContext.resume();
    } catch (error) {
      logSoundDebug('audio context resume failed', {
        state: audioContext.state,
        error: error instanceof Error ? error.message : 'Unknown resume error',
      });
    }
  }

  if (audioContext.state !== 'running') {
    logSoundDebug('audio context still not running after resume, recreating', { state: audioContext.state });
    resetAudioContext();
    audioContext = createAudioContext();
    if (audioContext.state !== 'running') {
      await audioContext.resume();
    }
  }

  logSoundDebug('audio context ready', { state: audioContext.state });
  return audioContext;
}

registerWarmupListeners();

async function playTone(frequency: number, durationMs: number, delayMs: number = 0, volume: number = 0.15): Promise<void> {
  const ctx = await getAudioContext();
  logSoundDebug('playTone', {
    frequency,
    durationMs,
    delayMs,
    volume,
    currentTime: ctx.currentTime,
    state: ctx.state,
  });
  return new Promise((resolve) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const startTime = ctx.currentTime + delayMs / 1000;
    osc.start(startTime);
    osc.stop(startTime + durationMs / 1000);
    osc.addEventListener('ended', () => resolve());
  });
}

let lastMessageSound = 0;

export function playMessageSound(): void {
  const now = Date.now();
  if (now - lastMessageSound < 1000) return;
  lastMessageSound = now;
  playTone(800, 150, 0, 0.6).catch(() => {});
}

export async function playMentionSound(): Promise<void> {
  await playTone(1000, 80, 0, 1.2);
  await playTone(1000, 80, 100, 1.2);
  await playTone(1000, 80, 200, 1.2);
}
