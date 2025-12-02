import { Decimal } from '@prisma/client/runtime/library';

/**
 * Serialize Prisma objects to JSON-safe format
 * Converts Decimal to string, Date to ISO string
 */
export function serializePrisma<T>(obj: T): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Decimal) {
    return obj.toString();
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
