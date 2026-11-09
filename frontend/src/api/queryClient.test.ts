import { describe, expect, it, vi } from 'vitest';
import { createQueryClient, shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it.each([400, 404, 422])('no reintenta un error %i', (status) => {
    expect(shouldRetry(0, { status })).toBe(false);
  });

  it('reintenta un error 5xx hasta dos veces', () => {
    const error = { status: 503 };
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('reintenta un error de red (sin código HTTP) hasta dos veces', () => {
    const error = new TypeError('Failed to fetch');
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('trata un `status` que no es número como error sin código HTTP', () => {
    expect(shouldRetry(0, { status: '404' })).toBe(true);
  });
});

describe('createQueryClient', () => {
  async function countAttempts(error: unknown): Promise<number> {
    const queryFn = vi.fn().mockRejectedValue(error);
    await expect(
      createQueryClient().fetchQuery({ queryKey: ['prueba'], queryFn, retryDelay: 0 }),
    ).rejects.toBe(error);
    return queryFn.mock.calls.length;
  }

  it('hace 3 intentos en total ante un 500', async () => {
    expect(await countAttempts({ status: 500 })).toBe(3);
  });

  it('hace un solo intento ante un 404', async () => {
    expect(await countAttempts({ status: 404 })).toBe(1);
  });
});
