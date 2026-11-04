// The part of the qrcode package Pocket uses. The package ships no types, and
// this is all the wallet page needs from it.
declare module 'qrcode' {
  export interface ToDataUrlOptions {
    margin?: number;
    width?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }

  export function toDataURL(text: string, options?: ToDataUrlOptions): Promise<string>;

  const QRCode: { toDataURL: typeof toDataURL };
  export default QRCode;
}
