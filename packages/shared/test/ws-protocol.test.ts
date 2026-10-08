import { describe, expect, it } from 'vitest';
import {
  WS_PROTOCOL_VERSION,
  deviceToServerFrameSchema,
  isDeviceToServerFrame,
  isServerToDeviceFrame,
  parseWsFrame,
  serverToDeviceFrameSchema,
} from '../src/ws-protocol.js';

const NOW = '2026-09-15T10:22:31.412Z';

function envelope(type: string, payload: unknown, extra: Record<string, unknown> = {}) {
  return {
    v: WS_PROTOCOL_VERSION,
    id: 'msg_01J000000000000000000000',
    type,
    ts: NOW,
    payload,
    ...extra,
  };
}

describe('device -> server frames', () => {
  it('accepts a HELLO frame', () => {
    const frame = envelope('HELLO', {
      appVersion: '1.0.0',
      osVersion: 'Windows 11',
      machineId: 'abc-123',
      printers: [{ systemName: 'HP LaserJet', supportsColor: false, supportsDuplex: true }],
    });
    const result = parseWsFrame(frame);
    expect(result.success).toBe(true);
  });

  it('accepts a HEARTBEAT frame', () => {
    const result = parseWsFrame(envelope('HEARTBEAT', { uptimeSec: 120, queueDepth: 0 }));
    expect(result.success).toBe(true);
  });

  it('accepts a JOB_RESULT frame with replyTo set', () => {
    const frame = envelope(
      'JOB_RESULT',
      {
        orderId: '018f0a3e-2e3a-7c9a-9f3a-000000000001',
        ok: true,
        verification: 'snmp',
        sheetsConfirmed: 5,
      },
      { replyTo: 'msg_01J000000000000000000ABC' },
    );
    expect(parseWsFrame(frame).success).toBe(true);
  });

  it('rejects a HELLO frame missing required fields', () => {
    const result = parseWsFrame(envelope('HELLO', { appVersion: '1.0.0' }));
    expect(result.success).toBe(false);
  });

  it('rejects the wrong protocol version', () => {
    const frame = { ...envelope('HEARTBEAT', { uptimeSec: 1, queueDepth: 0 }), v: 2 };
    expect(parseWsFrame(frame).success).toBe(false);
  });

  it('rejects an unknown frame type', () => {
    const result = parseWsFrame(envelope('NOT_A_REAL_TYPE', {}));
    expect(result.success).toBe(false);
  });

  it('rejects a malformed timestamp', () => {
    const frame = { ...envelope('HEARTBEAT', { uptimeSec: 1, queueDepth: 0 }), ts: 'not-a-date' };
    expect(parseWsFrame(frame).success).toBe(false);
  });

  it('isDeviceToServerFrame narrows correctly', () => {
    const parsed = deviceToServerFrameSchema.parse(
      envelope('HEARTBEAT', { uptimeSec: 1, queueDepth: 0 }),
    );
    expect(isDeviceToServerFrame(parsed)).toBe(true);
    expect(isServerToDeviceFrame(parsed)).toBe(false);
  });
});

describe('server -> device frames', () => {
  it('accepts a HELLO_ACK frame with pending jobs', () => {
    const job = {
      orderId: '018f0a3e-2e3a-7c9a-9f3a-000000000001',
      token: 'K7F2',
      pdfUrl: 'https://r2.example.com/orders/abc.pdf',
      pdfSha256: 'a'.repeat(64),
      printerSystemName: 'HP LaserJet',
      settings: { copies: 1, duplex: false, color: false, paperSize: 'A4' },
      coverSheet: {
        tokenNumber: 'K7F2',
        orderShortCode: 'K7F2',
        maskedPhone: '+91 98••• ••210',
        pageCount: 5,
      },
    };
    const frame = envelope('HELLO_ACK', {
      shopId: '018f0a3e-2e3a-7c9a-9f3a-000000000002',
      shopName: 'Sri Lakshmi Xerox',
      config: {},
      serverTime: NOW,
      pendingJobs: [job],
    });
    const result = parseWsFrame(frame);
    expect(result.success).toBe(true);
  });

  it('accepts a JOB_DISPATCH frame', () => {
    const frame = envelope('JOB_DISPATCH', {
      orderId: '018f0a3e-2e3a-7c9a-9f3a-000000000001',
      token: 'K7F2',
      pdfUrl: 'https://r2.example.com/orders/abc.pdf',
      pdfSha256: 'a'.repeat(64),
      printerSystemName: 'HP LaserJet',
      settings: { copies: 2, duplex: true, color: false, pageRange: '1-5', paperSize: 'A4' },
      coverSheet: {
        tokenNumber: 'K7F2',
        orderShortCode: 'K7F2',
        maskedPhone: '+91 98••• ••210',
        pageCount: 5,
      },
    });
    expect(parseWsFrame(frame).success).toBe(true);
  });

  it('rejects a JOB_DISPATCH with a bad sha256 length', () => {
    const frame = envelope('JOB_DISPATCH', {
      orderId: '018f0a3e-2e3a-7c9a-9f3a-000000000001',
      token: 'K7F2',
      pdfUrl: 'https://r2.example.com/orders/abc.pdf',
      pdfSha256: 'too-short',
      printerSystemName: 'HP LaserJet',
      settings: { copies: 1, duplex: false, color: false, paperSize: 'A4' },
      coverSheet: {
        tokenNumber: 'K7F2',
        orderShortCode: 'K7F2',
        maskedPhone: '+91 98••• ••210',
        pageCount: 5,
      },
    });
    expect(parseWsFrame(frame).success).toBe(false);
  });

  it('accepts a CONFIG_UPDATE frame and tolerates extra fields (catchall)', () => {
    const frame = envelope('CONFIG_UPDATE', {
      maxPagesPerOrder: 100,
      approvalThresholdPages: 50,
      secureRelease: false,
      somethingFutureAddedHere: true,
    });
    expect(parseWsFrame(frame).success).toBe(true);
  });

  it('isServerToDeviceFrame narrows correctly', () => {
    const parsed = serverToDeviceFrameSchema.parse(envelope('PONG', { serverTime: NOW }));
    expect(isServerToDeviceFrame(parsed)).toBe(true);
    expect(isDeviceToServerFrame(parsed)).toBe(false);
  });
});
