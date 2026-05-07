import { Injectable, HttpException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';

export interface OcrResult {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  confidence: number;
  rawText?: string;
  receiptUrl: string;
}

const VALID_CATEGORIES = new Set([
  'food', 'transport', 'shopping', 'health',
  'entertainment', 'travel', 'groceries', 'salary', 'other',
]);

const PROMPT = `You are a receipt and expense image analyzer.

Look at this image carefully. It may be a receipt, invoice, bill, or any expense-related image.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) with these fields:
{
  "amount": <the total amount paid as a number, or null if not visible>,
  "merchant": <the business or store name as a string, or null>,
  "date": <the date in YYYY-MM-DD format as a string, or null>,
  "category": <one of exactly: food, transport, shopping, health, entertainment, travel, groceries, salary, other>,
  "description": <a single sentence describing what was purchased, or null>
}

If you cannot read any text, still return your best estimate based on what you can see.`;

function parseJsonFromLlm(raw: string): any {
  let text = raw.trim();
  // strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(text);
}

@Injectable()
export class OcrService {
  private client: OpenAI;

  constructor() {
    const apiKey = (process.env.OPEN_AI_KEY ?? '').trim();
    if (!apiKey) {
      console.error('[OCR] OPEN_AI_KEY is not set in environment variables');
    }
    this.client = new OpenAI({ apiKey });
  }

  private saveBufferToDisk(buffer: Buffer, mimeType: string): string {
    const ext      = mimeType.includes('png') ? 'png' : 'jpg';
    const filename = `${randomUUID()}.${ext}`;
    const dir      = path.join(process.cwd(), 'uploads', 'receipts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `/uploads/receipts/${filename}`;
  }

  async scanReceipt(buffer: Buffer, mimeType = 'image/jpeg'): Promise<OcrResult> {
    const apiKey = (process.env.OPEN_AI_KEY ?? '').trim();
    if (!apiKey) {
      throw new HttpException('OpenAI API key not configured on server', 500);
    }

    const safeType  = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const base64    = buffer.toString('base64');
    const dataUrl   = `data:${safeType};base64,${base64}`;
    const receiptUrl = this.saveBufferToDisk(buffer, safeType);

    console.log(`[OCR] Sending image to GPT-4o (${Math.round(buffer.length / 1024)}KB, ${safeType})`);

    let rawContent = '';
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 400,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      });

      rawContent = response.choices[0]?.message?.content?.trim() ?? '';
      console.log('[OCR] GPT-4o raw response:', rawContent);

      const parsed = parseJsonFromLlm(rawContent);

      return {
        amount:      typeof parsed.amount      === 'number' ? parsed.amount      : null,
        merchant:    typeof parsed.merchant    === 'string' ? parsed.merchant    : null,
        date:        typeof parsed.date        === 'string' ? parsed.date        : null,
        category:    VALID_CATEGORIES.has(parsed.category) ? parsed.category    : 'other',
        description: typeof parsed.description === 'string' ? parsed.description : null,
        confidence:  0.95,
        rawText:     rawContent,
        receiptUrl,
      };
    } catch (err: any) {
      console.error('[OCR] Error:', err?.message ?? err);
      if (rawContent) {
        console.error('[OCR] Unparseable response:', rawContent);
        return {
          amount: null, merchant: null, date: null,
          category: 'other', description: rawContent.slice(0, 200),
          confidence: 0.3, rawText: rawContent,
          receiptUrl,
        };
      }
      throw new HttpException(
        err?.message?.includes('API key') ? 'OpenAI API key is invalid' : 'Receipt analysis failed',
        500,
      );
    }
  }
}
