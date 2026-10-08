/**
 * The §23 WebSocket protocol, as zod schemas. Every frame that crosses
 * `wss://api.kagaz.app/device/ws` — in either direction — is validated
 * against one of these before anything touches it.
 */

import { z } from 'zod';

export const WS_PROTOCOL_VERSION = 1 as const;

const envelopeShape = {
  v: z.literal(WS_PROTOCOL_VERSION),
  id: z.string().min(1),
  ts: z.string().datetime({ offset: true }),
  replyTo: z.string().min(1).optional(),
};

const printerInfoSchema = z.object({
  systemName: z.string().min(1),
  displayName: z.string().optional(),
  supportsColor: z.boolean(),
  supportsDuplex: z.boolean(),
  isNetwork: z.boolean().optional(),
});

const jobDispatchSettingsSchema = z.object({
  copies: z.number().int().positive(),
  duplex: z.boolean(),
  color: z.boolean(),
  pageRange: z.string().optional(),
  paperSize: z.string().min(1),
});

const coverSheetSchema = z.object({
  tokenNumber: z.union([z.string(), z.number().int()]),
  orderShortCode: z.string().min(1),
  maskedPhone: z.string().min(1),
  pageCount: z.number().int().nonnegative(),
});

const jobDispatchPayloadSchema = z.object({
  orderId: z.string().uuid(),
  token: z.union([z.string(), z.number().int()]),
  pdfUrl: z.string().url(),
  pdfSha256: z.string().length(64),
  printerSystemName: z.string().min(1),
  settings: jobDispatchSettingsSchema,
  coverSheet: coverSheetSchema,
});

// ---- Device -> Server payloads ----

const helloPayloadSchema = z.object({
  appVersion: z.string().min(1),
  osVersion: z.string().min(1),
  machineId: z.string().min(1),
  printers: z.array(printerInfoSchema),
});

const heartbeatPayloadSchema = z.object({
  uptimeSec: z.number().nonnegative(),
  queueDepth: z.number().int().nonnegative(),
});

const printerStatusEntrySchema = z.object({
  systemName: z.string().min(1),
  status: z.string().min(1),
  errorFlags: z.array(z.string()),
  tonerPct: z.number().min(0).max(100).optional(),
  pageCounter: z.number().int().nonnegative().optional(),
});

const printerStatusPayloadSchema = z.object({
  printers: z.array(printerStatusEntrySchema),
});

const preflightResultPayloadSchema = z.object({
  orderId: z.string().uuid(),
  ok: z.boolean(),
  printerSystemName: z.string().optional(),
  reasonCode: z.string().optional(),
  confidence: z.enum(['high', 'low']),
});

const jobAckPayloadSchema = z.object({
  orderId: z.string().uuid(),
  accepted: z.boolean(),
  reasonCode: z.string().optional(),
});

const jobProgressPayloadSchema = z.object({
  orderId: z.string().uuid(),
  stage: z.enum(['downloading', 'spooling', 'printing']),
  pct: z.number().min(0).max(100).optional(),
});

const jobResultPayloadSchema = z.object({
  orderId: z.string().uuid(),
  ok: z.boolean(),
  verification: z.enum(['snmp', 'spooler']),
  sheetsConfirmed: z.number().int().nonnegative().optional(),
  failureCode: z.string().optional(),
  detail: z.string().optional(),
});

const approvalDecisionPayloadSchema = z.object({
  orderId: z.string().uuid(),
  approved: z.boolean(),
  operatorNote: z.string().optional(),
});

const rateCardUpdatePayloadSchema = z.object({
  card: z.record(z.string(), z.unknown()),
});

const withdrawRequestPayloadSchema = z.object({
  amountPaise: z.number().int().positive(),
});

const printerConfigPayloadSchema = z.object({
  systemName: z.string().min(1),
  isEnabled: z.boolean(),
  priority: z.number().int(),
  maintenanceNote: z.string().optional(),
});

export const deviceToServerFrameSchema = z.discriminatedUnion('type', [
  z.object({ ...envelopeShape, type: z.literal('HELLO'), payload: helloPayloadSchema }),
  z.object({ ...envelopeShape, type: z.literal('HEARTBEAT'), payload: heartbeatPayloadSchema }),
  z.object({
    ...envelopeShape,
    type: z.literal('PRINTER_STATUS'),
    payload: printerStatusPayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('PREFLIGHT_RESULT'),
    payload: preflightResultPayloadSchema,
  }),
  z.object({ ...envelopeShape, type: z.literal('JOB_ACK'), payload: jobAckPayloadSchema }),
  z.object({
    ...envelopeShape,
    type: z.literal('JOB_PROGRESS'),
    payload: jobProgressPayloadSchema,
  }),
  z.object({ ...envelopeShape, type: z.literal('JOB_RESULT'), payload: jobResultPayloadSchema }),
  z.object({
    ...envelopeShape,
    type: z.literal('APPROVAL_DECISION'),
    payload: approvalDecisionPayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('RATE_CARD_UPDATE'),
    payload: rateCardUpdatePayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('WITHDRAW_REQUEST'),
    payload: withdrawRequestPayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('PRINTER_CONFIG'),
    payload: printerConfigPayloadSchema,
  }),
]);

// ---- Server -> Device payloads ----

const helloAckPayloadSchema = z.object({
  shopId: z.string().uuid(),
  shopName: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  serverTime: z.string().datetime({ offset: true }),
  pendingJobs: z.array(jobDispatchPayloadSchema),
});

const pongPayloadSchema = z.object({
  serverTime: z.string().datetime({ offset: true }),
});

const preflightRequestPayloadSchema = z.object({
  orderId: z.string().uuid(),
  needsColor: z.boolean(),
  needsDuplex: z.boolean(),
  paperSize: z.string().min(1),
  sheets: z.number().int().positive(),
});

const jobCancelPayloadSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(1),
});

const configUpdatePayloadSchema = z
  .object({
    maxPagesPerOrder: z.number().int().positive(),
    approvalThresholdPages: z.number().int().nonnegative(),
    secureRelease: z.boolean(),
  })
  .catchall(z.unknown());

const orderUpdatePayloadSchema = z.object({
  order: z.record(z.string(), z.unknown()),
});

const walletUpdatePayloadSchema = z.object({
  balancePaise: z.number().int(),
  todayPaise: z.number().int(),
  todayOrders: z.number().int().nonnegative(),
});

const forceUpdatePayloadSchema = z.object({
  minVersion: z.string().min(1),
  downloadUrl: z.string().url(),
});

export const serverToDeviceFrameSchema = z.discriminatedUnion('type', [
  z.object({ ...envelopeShape, type: z.literal('HELLO_ACK'), payload: helloAckPayloadSchema }),
  z.object({ ...envelopeShape, type: z.literal('PONG'), payload: pongPayloadSchema }),
  z.object({
    ...envelopeShape,
    type: z.literal('PREFLIGHT_REQUEST'),
    payload: preflightRequestPayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('JOB_DISPATCH'),
    payload: jobDispatchPayloadSchema,
  }),
  z.object({ ...envelopeShape, type: z.literal('JOB_CANCEL'), payload: jobCancelPayloadSchema }),
  z.object({
    ...envelopeShape,
    type: z.literal('CONFIG_UPDATE'),
    payload: configUpdatePayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('ORDER_UPDATE'),
    payload: orderUpdatePayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('WALLET_UPDATE'),
    payload: walletUpdatePayloadSchema,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('FORCE_UPDATE'),
    payload: forceUpdatePayloadSchema,
  }),
]);

export const wsFrameSchema = z.union([deviceToServerFrameSchema, serverToDeviceFrameSchema]);

export type DeviceToServerFrame = z.infer<typeof deviceToServerFrameSchema>;
export type ServerToDeviceFrame = z.infer<typeof serverToDeviceFrameSchema>;
export type WsFrame = z.infer<typeof wsFrameSchema>;

export type DeviceToServerFrameType = DeviceToServerFrame['type'];
export type ServerToDeviceFrameType = ServerToDeviceFrame['type'];

/** Parses and validates a raw (already-`JSON.parse`d) frame. Never throws. */
export function parseWsFrame(raw: unknown): z.SafeParseReturnType<unknown, WsFrame> {
  return wsFrameSchema.safeParse(raw);
}

export function isDeviceToServerFrame(frame: WsFrame): frame is DeviceToServerFrame {
  return deviceToServerFrameSchema.safeParse(frame).success;
}

export function isServerToDeviceFrame(frame: WsFrame): frame is ServerToDeviceFrame {
  return serverToDeviceFrameSchema.safeParse(frame).success;
}
