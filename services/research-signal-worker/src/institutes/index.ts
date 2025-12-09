import { HybridNonCryptoInstitute } from "./hybrid";
import { YahooFinanceInstitute } from "./yahoo";
import { InstituteHandler } from "./types";

export * from "./types";
export { HybridNonCryptoInstitute } from "./hybrid";
export { YahooFinanceInstitute } from "./yahoo";

export function getInstituteHandlers(): InstituteHandler[] {
  return [new HybridNonCryptoInstitute(), new YahooFinanceInstitute()];
}
