import { Injectable } from '@nestjs/common';

@Injectable()
export class OcrService {
  async scanReceipt(buffer: Buffer): Promise<{
    amount: number | null;
    merchant: string | null;
    date: string | null;
    confidence: number;
  }> {
    // Lazy-load tesseract.js to avoid startup cost
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Tesseract = require('tesseract.js') as typeof import('tesseract.js');

    const result = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {},
    });

    const text       = result.data.text;
    const confidence = result.data.confidence / 100;

    // Extract total amount
    const amtMatch = text.match(/total[\s:]*\$?([\d,]+\.?\d{0,2})/i);
    const amount   = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : null;

    // Extract merchant: first non-numeric meaningful line
    const lines    = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const merchant = lines.find(l => !/^\d/.test(l)) ?? null;

    // Extract date
    const dateMatch = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s,]+\d{1,2}([\s,]+\d{4})?/i);
    const date      = dateMatch ? dateMatch[0] : null;

    return { amount, merchant, date, confidence };
  }
}
