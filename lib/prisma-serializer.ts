import { Decimal } from '@prisma/client/runtime/library';

/**
 * Serialize Prisma objects to JSON-safe format
 * Converts Decimal to string, Date to ISO string
 */
export function serializePrisma<T>(obj: T): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check if it's a Prisma/decimal.js Decimal
  if (obj instanceof Decimal || (obj as any)?.constructor?.name === 'Decimal' || typeof (obj as any)?.toFixed === 'function' && (obj as any)?.d && (obj as any)?.s !== undefined) {
    return (obj as any).toString();
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(serializePrisma);
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializePrisma(value);
    }
    return result;
  }

  return obj;
}
