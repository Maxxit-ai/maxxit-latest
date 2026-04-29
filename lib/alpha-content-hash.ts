import { createHash } from "crypto";

function sortKeys(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key: string) => {
      acc[key] = sortKeys(obj[key]);
      return acc;
    }, {});
}

export function hashAlphaContent(content: any): string {
  const contentString =
    typeof content === "string" ? content : JSON.stringify(sortKeys(content));
  return createHash("sha256").update(contentString).digest("hex");
}
