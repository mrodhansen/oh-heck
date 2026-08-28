import { BadRequestException } from '@nestjs/common';
import { resolveGrokConfig, type GrokConfig } from './grok-auth';

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
const MAX_IMAGE_CHARS = 5_500_000;

export const SCORECARD_PROMPT = `You are reading a handwritten Oh Heck paper scorecard photo.
Return ONLY a JSON object. No markdown, no commentary.

This family's sheet looks like this (always):

  [finish places: 5  6  2  4  1  L  3]     date e.g. 7/19/26
  |     | Ashley | Tanner | Milly | Lucas | Bekah | Zeka | Jere |
  |  7  | 0/1 -1 | 0/1 -1 | 1/1 6 | ...
  |  6  | 0/2 -3 | 1/1  5 | ...
  |  5  |
  |  4  |
  |  3  |
  |  2  |
  |  1  |
  |  2  |
  |  3  |
  |  4  |
  |  5  |
  |  6  |
  |  7  |
  notes as bullets under the grid

LAYOUT — do not invent a different structure:
1. Player names are the column headers, left to right. position 1 = leftmost name.
2. Ignore the small numbers (or "L") written ABOVE the names — those are finish places, not bids.
3. The leftmost column is HAND SIZE (cards dealt), not a round number. There are exactly 13 data rows in this order:
   7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7
   handNumber 1 = first 7-card row (top). handNumber 8 = the second 2-card row. handNumber 13 = the last 7-card row (bottom).
4. Each player cell is TWO values:
   - A fraction with a slash: BID / TRICKS TAKEN
     LEFT or TOP of the slash = bid
     RIGHT or BOTTOM of the slash = tricksTaken
     Example: "0/1" means bid 0, tricksTaken 1. "2/3" means bid 2, tricksTaken 3. "1/1" means bid 1, tricksTaken 1.
   - A number to the RIGHT of the fraction is the RUNNING TOTAL. Never report it. We recompute scores.
5. Hatched / shaded / scribbled-over fraction cells mean they missed the bid. Still read bid and tricksTaken. Shading is NOT force burn.
6. Force burn is only the letters "FB" written on a row (often near the right edge). Set forceBurn true for that whole hand, false otherwise.
7. Date is usually top-right (M/D/YY or M/D/YYYY). Convert to YYYY-MM-DD. Two-digit years are 20xx (7/19/26 → 2026-07-19).
8. Bullet lines under the grid are notes. Copy them as strings. Ignore "Oh Heck!" title.

CHECKS before you answer (fix your reading if they fail):
- Every row: sum of tricksTaken across players MUST equal that row's hand size. If it does not, you swapped bid and tricksTaken or misread a digit — re-read that row.
- bid and tricksTaken are integers 0..handSize.
- Include every named player on every one of the 13 hands.
- If a name is unreadable, use "Player N" for that column. Never drop a column you can see.
- 0 vs 6 and 1 vs 7 are common handwriting mixups. Prefer the reading that makes tricks sum to hand size.

JSON shape:
{
  "gameDate": "2026-07-19",
  "players": [{ "name": "Ashley", "position": 1 }, { "name": "Tanner", "position": 2 }],
  "rounds": [
    {
      "handNumber": 1,
      "forceBurn": false,
      "scores": [
        { "playerName": "Ashley", "bid": 0, "tricksTaken": 1 }
      ]
    }
  ],
  "notes": ["Tanner's first game"]
}`

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function splitImagePayload(raw: string): {
  base64: string;
  mimeType: ImageMime;
} {
  const trimmed = raw.trim();
  const dataUrl = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    trimmed,
  );
  if (dataUrl?.[1] && dataUrl[2]) {
    const mime = dataUrl[1].toLowerCase() as ImageMime;
    const base64 = dataUrl[2].replace(/\s+/g, '');
    return { base64, mimeType: mime };
  }
  if (trimmed.startsWith('data:')) {
    throw new BadRequestException(
      'Image must be JPEG, PNG, or WebP (data URL mime not supported)',
    );
  }
  const base64 = trimmed.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    throw new BadRequestException('imageBase64 is not valid base64');
  }
  return { base64, mimeType: 'image/jpeg' };
}

export function assertImageSize(base64: string): void {
  if (base64.length < 32) {
    throw new BadRequestException('Image is empty');
  }
  if (base64.length > MAX_IMAGE_CHARS) {
    throw new BadRequestException(
      'Image is too large — compress it and try again',
    );
  }
}

type XaiMessage = {
  role: string;
  content: unknown;
};

type XaiResponse = {
  choices?: { message?: XaiMessage }[];
  error?: { message?: string };
};

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    throw new BadRequestException('LLM message content was not text');
  }
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
      continue;
    }
    if (
      part &&
      typeof part === 'object' &&
      'text' in part &&
      typeof (part as { text: unknown }).text === 'string'
    ) {
      parts.push((part as { text: string }).text);
    }
  }
  const text = parts.join('\n').trim();
  if (!text) {
    throw new BadRequestException('LLM message content was empty');
  }
  return text;
}

export async function readScorecardWithGrok(args: {
  base64: string;
  mimeType: ImageMime;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchFn = args.fetchImpl ?? fetch;
  const res = await fetchFn(XAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${args.mimeType};base64,${args.base64}`,
              },
            },
            { type: 'text', text: SCORECARD_PROMPT },
          ],
        },
      ],
    }),
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new BadRequestException(
      `Grok API returned non-JSON (${res.status})`,
    );
  }
  if (!res.ok) {
    const errMsg =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      body.error &&
      typeof body.error === 'object' &&
      'message' in body.error &&
      typeof (body.error as { message: unknown }).message === 'string'
        ? (body.error as { message: string }).message
        : `Grok API failed (${res.status})`;
    throw new BadRequestException(errMsg);
  }
  const parsed = body as XaiResponse;
  const content = parsed.choices?.[0]?.message?.content;
  if (content == null) {
    throw new BadRequestException('Grok API returned no message');
  }
  return messageText(content);
}

export async function grokConfig(): Promise<GrokConfig> {
  return resolveGrokConfig();
}
