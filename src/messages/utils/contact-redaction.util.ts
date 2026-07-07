/**
 * Strips contact info (emails, phone numbers) out of chat messages so
 * visitors and hosts can't arrange to move a booking off-platform before
 * paying. This is a heuristic, not a guarantee — a determined user can still
 * spell out digits ("zero eight zero...") or split a number across messages.
 * It's meant to stop the common case (pasting a number/email), not defeat a
 * user who is deliberately trying to evade it.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Candidate digit runs (with common separators) that might be phone numbers.
// Filtered further below by actual digit count, to avoid flagging dates,
// prices, or short room/measurement numbers.
const PHONE_CANDIDATE_REGEX = /\+?\d[\d\s\-().]{6,15}\d/g;

const SOCIAL_KEYWORDS = /(whatsapp|whats app|telegram|instagram|\bIG\b|snapchat|snap chat)/i;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function looksLikePhoneNumber(candidate: string): boolean {
  const digits = digitsOnly(candidate);
  if (candidate.trim().startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15;
  }
  // Nigerian mobile numbers: 11 digits starting with 0, or 10 digits without it.
  return digits.length === 10 || digits.length === 11;
}

export interface RedactionResult {
  content: string;
  wasRedacted: boolean;
}

export function redactContactInfo(rawContent: string): RedactionResult {
  let wasRedacted = false;
  let content = rawContent;

  content = content.replace(EMAIL_REGEX, () => {
    wasRedacted = true;
    return '[email removed]';
  });

  content = content.replace(PHONE_CANDIDATE_REGEX, (match) => {
    if (!looksLikePhoneNumber(match)) return match;
    wasRedacted = true;
    return '[phone number removed]';
  });

  if (SOCIAL_KEYWORDS.test(content)) {
    wasRedacted = true;
    content = content.replace(SOCIAL_KEYWORDS, '[social contact removed]');
  }

  return { content, wasRedacted };
}
