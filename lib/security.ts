// Security utilities for input validation and sanitization

export const VALID_SCREENS = ['large', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
export type ValidScreen = typeof VALID_SCREENS[number];

// Input validation functions
export function isValidScreen(screen: string): screen is ValidScreen {
  return VALID_SCREENS.includes(screen as ValidScreen);
}

export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function validateInteger(value: unknown): number | null {
  const num = Number(value);
  if (Number.isInteger(num) && num > 0) {
    return num;
  }
  return null;
}

// String sanitization
export function sanitizeString(input: string, maxLength: number = 100): string {
  // Remove potentially dangerous characters and limit length
  return input.replace(/[<>"/\\&]/g, '').trim().substring(0, maxLength);
}

// Validation schemas
export interface StreamInput {
  name: string;
  url: string;
  team_id: number;
}

export interface ScreenInput {
  screen: string;
  id: number;
}

export function validateStreamInput(input: unknown): { valid: boolean; errors: string[]; data?: StreamInput } {
  const errors: string[] = [];
  const data = input as Record<string, unknown>;

  if (!data.name || typeof data.name !== 'string') {
    errors.push('Name is required and must be a string');
  } else if (data.name.length > 100) {
    errors.push('Name must be 100 characters or less');
  }


  if (!data.url || typeof data.url !== 'string') {
    errors.push('URL is required and must be a string');
  } else if (!isValidUrl(data.url)) {
    errors.push('URL must be a valid http:// or https:// URL');
  }

  if (!isPositiveInteger(data.team_id)) {
    errors.push('Team ID must be a positive integer');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      name: sanitizeString(data.name as string),
      url: data.url as string,
      team_id: data.team_id as number,
    },
  };
}

export function validateScreenInput(input: unknown): { valid: boolean; errors: string[]; data?: ScreenInput } {
  const errors: string[] = [];
  const data = input as Record<string, unknown>;

  if (!data.screen || typeof data.screen !== 'string') {
    errors.push('Screen is required and must be a string');
  } else if (!isValidScreen(data.screen)) {
    errors.push(`Screen must be one of: ${VALID_SCREENS.join(', ')}`);
  }

  if (!isPositiveInteger(data.id)) {
    errors.push('ID must be a positive integer');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      screen: data.screen as string,
      id: data.id as number,
    },
  };
}