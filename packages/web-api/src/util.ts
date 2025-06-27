import { JSONValue, NormalizedObject } from './types/util';
import { createHash } from 'crypto';

/**
 * Recursively normalizes an object to ensure deterministic serialization
 * @param value - The value to normalize
 * @returns A normalized version of the input
 */
export function normalizeObject(value: any): JSONValue {
  // Handle null early
  if (value === null) {
    return null;
  }

  // Handle different types
  switch (typeof value) {
    case 'string':
      // Normalize string whitespace
      return value.trim().replace(/\s+/g, ' ');

    case 'number':
      // Handle NaN and Infinity
      if (!Number.isFinite(value)) {
        return null;
      }
      return value;

    case 'boolean':
      return value;

    case 'object':
      // Handle arrays - preserve order
      if (Array.isArray(value)) {
        return value.map(item => normalizeObject(item)).filter(item => item !== undefined);
      }

      // Handle regular objects - sort keys
      const normalized: NormalizedObject = {};

      // Sort keys alphabetically to ensure consistent ordering
      const sortedKeys = Object.keys(value).sort();

      for (const key of sortedKeys) {
        const normalizedValue = normalizeObject(value[key]);
        // Only include defined values
        if (normalizedValue !== undefined) {
          normalized[key.trim()] = normalizedValue;
        }
      }

      return normalized;

    default:
      // Skip undefined, functions, symbols, etc.
      return null;
  }
}

/**
 * Creates a deterministic hash of any JSON-serializable object
 * @param obj - The object to hash
 * @returns A hex string hash of the normalized object
 * @throws Error if object cannot be safely converted to JSON
 */
export function hashObject(obj: any): string {
  try {
    // First attempt to normalize the object
    const normalized = normalizeObject(obj);
    // Convert to a deterministic string representation
    const stringified = JSON.stringify(normalized);
    // Create hash using SHA-256
    return createHash('sha256').update(stringified).digest('hex');
  } catch (error) {
    throw new Error(
      `Failed to hash object: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Trims and lower cases email addresses
 */
export function tidyUpEmail(email: string) {
  return email.toLowerCase().trim();
}
