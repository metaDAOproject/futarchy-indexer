import { expect, test, describe } from "bun:test";
import { getHumanPrice } from "./math";
import { PriceMath } from "@metadaoproject/futarchy/v0.3";
import { BN } from "@coral-xyz/anchor";

describe("getHumanPrice", () => {
  test("decimal value", () => {
    const priceFromReserves = PriceMath.getAmmPriceFromReserves(
      new BN(25000000000),
      new BN(10000000000)
    );

    const price = getHumanPrice(priceFromReserves, 6, 6);

    expect(price).toBe(0.4);
  });
});
