import * as QRCode from 'qrcode';
import { QR_PREFIX } from '@sportsos/shared';

export { QR_PREFIX };

export function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

/** Accepts either a bare code or the full `sportsos://…` URI. */
export function stripQrPrefix(value: string, prefix: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
}
