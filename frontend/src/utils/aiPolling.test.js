import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollAIVideoStatus } from './aiPolling';

describe('pollAIVideoStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'mock-token'),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles ready status', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ready', cloudinary_url: 'http://video.url', transcript_name: 'test.vtt' }),
    });

    const result = await pollAIVideoStatus('job1');
    expect(result).toEqual({ videoUrl: 'http://video.url', transcriptName: 'test.vtt' });
  });

  it('polls until ready status', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'processing' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ready', videoUrl: 'http://video2.url' }),
      });

    const promise = pollAIVideoStatus('job2');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ videoUrl: 'http://video2.url', transcriptName: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('handles failed status', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'failed' }),
    });

    await expect(pollAIVideoStatus('job3')).rejects.toThrow('Video generation failed');
  });

  it('handles not_found status', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'not_found' }),
    });

    await expect(pollAIVideoStatus('job4')).rejects.toThrow('Job not found');
  });

  it('handles 404 HTTP error', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(pollAIVideoStatus('job5')).rejects.toThrow('Job not found');
  });

  it('handles other HTTP errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(pollAIVideoStatus('job6')).rejects.toThrow('HTTP error: 500');
  });

  it('handles invalid JSON', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new Error('parse error'); },
    });

    await expect(pollAIVideoStatus('job7')).rejects.toThrow('Invalid JSON response');
  });

  it('handles cancellation', async () => {
    const controller = new AbortController();
    
    fetch.mockImplementationOnce(() => {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    controller.abort();
    await expect(pollAIVideoStatus('job8', { signal: controller.signal })).rejects.toThrow('Polling cancelled');
  });

  it('handles timeout', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'processing' }),
    });

    const promise = pollAIVideoStatus('job9', { interval: 10, maxAttempts: 3 });
    promise.catch(() => {}); // Prevent unhandled rejection warning
    
    // We need to advance timers 3 times to exhaust the attempts
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    await expect(promise).rejects.toThrow('Polling timed out');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
