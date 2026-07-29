import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../../../src/common/request-context';
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
} from '../../../src/common/request-id.middleware';
import { JsonLogger } from '../../../src/logging/json-logger';

describe('requestIdMiddleware', () => {
  it('echoes incoming x-request-id and exposes it via ALS', () => {
    const req = {
      header: (name: string) =>
        name === REQUEST_ID_HEADER ? 'test-1' : undefined,
    } as Request;
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as Response;
    let seen: string | undefined;
    const next: NextFunction = () => {
      seen = getRequestId();
    };

    requestIdMiddleware(req, res, next);

    expect(headers[REQUEST_ID_HEADER]).toBe('test-1');
    expect(seen).toBe('test-1');
  });

  it('generates a request id when header is absent or invalid', () => {
    const req = {
      header: (name: string) =>
        name === REQUEST_ID_HEADER ? 'bad id with spaces!' : undefined,
    } as Request;
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as Response;
    let seen: string | undefined;
    requestIdMiddleware(req, res, () => {
      seen = getRequestId();
    });

    expect(headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(seen).toBe(headers[REQUEST_ID_HEADER]);
  });

  it('JsonLogger includes requestId from ALS', () => {
    const writes: string[] = [];
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });

    const req = {
      header: (name: string) =>
        name === REQUEST_ID_HEADER ? 'log-req' : undefined,
    } as Request;
    const res = { setHeader: () => undefined } as unknown as Response;

    requestIdMiddleware(req, res, () => {
      new JsonLogger().log('hello', 'Test');
    });

    spy.mockRestore();
    const line = writes.find((w) => w.includes('"hello"'));
    expect(line).toBeDefined();
    expect(JSON.parse(line!)).toMatchObject({
      message: 'hello',
      requestId: 'log-req',
    });
  });
});
