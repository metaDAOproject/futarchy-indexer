import {
  OrdersRecord,
  TakesRecord,
} from "@metadaoproject/indexer-db/lib/schema";

export type SwapPersistable = {
  ordersRecord: OrdersRecord;
  takesRecord: TakesRecord;
};
