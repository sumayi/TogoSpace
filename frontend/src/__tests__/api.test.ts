import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGlobalRequestError,
  globalRequestErrors,
  showTokenDialog,
} from '../appUiState';
import { clearToken, setToken } from '../authStore';
import { getSystemStatus, getTeams } from '../api';

describe('api request handling', () => {
  beforeEach(() => {
    clearGlobalRequestError();
    clearToken();
    showTokenDialog.value = false;
    vi.restoreAllMocks();
  });

  it('attaches auth headers for regular API requests', async () => {
    setToken('abc123');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ teams: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await getTeams();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc123',
    });
  });

  it('skips auth headers for exempt paths', async () => {
    setToken('abc123');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      initialized: true,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await getSystemStatus();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('opens token dialog on auth_required responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error_code: 'auth_required',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTeams()).rejects.toThrow('Auth required');
    expect(showTokenDialog.value).toBe(true);
    expect(globalRequestErrors.value).toHaveLength(0);
  });

  it('surfaces backend unavailable errors as global request toasts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error_code: 'BACKEND_UNAVAILABLE',
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTeams()).rejects.toThrow('Backend unavailable');

    expect(globalRequestErrors.value).toHaveLength(1);
    expect(globalRequestErrors.value[0]?.statusCode).toBe(502);
    expect(globalRequestErrors.value[0]?.path).toContain('/teams/list.json');
  });

  it('creates connection error toasts for network failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTeams()).rejects.toThrow('network down');

    expect(globalRequestErrors.value).toHaveLength(1);
    expect(globalRequestErrors.value[0]?.path).toContain('/teams/list.json');
    expect(globalRequestErrors.value[0]?.statusCode).toBeNull();
  });
});
