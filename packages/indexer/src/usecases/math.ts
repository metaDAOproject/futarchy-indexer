import { BN } from "@coral-xyz/anchor";
import { logger } from "../logger";

export function getHumanPrice(
  ammPrice: BN,
  baseDecimals: number,
  quoteDecimals: number
): number {
  const decimalScalar = new BN(10).pow(
    new BN(quoteDecimals - baseDecimals).abs()
  );
  const price1e12 =
    quoteDecimals > baseDecimals
      ? ammPrice.div(decimalScalar)
      : ammPrice.mul(decimalScalar);

  try {
    return price1e12.toNumber() / 1e12;
  } catch (e) {
    logger.error("error with getting human price", e);
    return price1e12.div(new BN(1e12)).toNumber();
  }
}
