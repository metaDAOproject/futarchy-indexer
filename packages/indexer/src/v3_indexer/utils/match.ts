/**
 * The constructs here allow us to mimic Rust's strongly typed error handling
 */
export type TaggedUnion = {
  type: string;
  value?: any;
};

export type Result<Ok, Err extends TaggedUnion> =
  | { success: true; ok: Ok }
  | { success: false; error: Err };

export function Err<Ok, Err extends TaggedUnion>(error: Err): Result<Ok, Err> {
  return { success: false, error };
}

export function Ok<Ok, Err extends TaggedUnion>(ok: Ok): Result<Ok, Err> {
  return { success: true, ok };
}
