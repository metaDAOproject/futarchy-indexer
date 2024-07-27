import { BN } from "@coral-xyz/anchor";

export function getHumanPrice(
  ammPrice: BN,
  baseDecimals: number,
  quoteDecimals: number
) {
  let decimalScalar = new BN(10).pow(
    new BN(quoteDecimals - baseDecimals).abs()
  );
  let price1e12 =
    quoteDecimals > baseDecimals
      ? ammPrice.div(decimalScalar)
      : ammPrice.mul(decimalScalar);
  return price1e12.div(new BN(1e12)).toNumber();
}
