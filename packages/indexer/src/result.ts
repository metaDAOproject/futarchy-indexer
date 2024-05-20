/**
 * The constructs here allow us to mimic Rust's strongly typed error handling
 */
export type TaggedUnion = {
  type: string;
};

export type ErrEnum = TaggedUnion;

export type Result<Ok, Err extends ErrEnum> =
  | { success: true; ok: Ok }
  | { success: false; error: Err };

export function Err<Ok, Err extends ErrEnum>(error: Err): Result<Ok, Err> {
  return { success: false, error };
}

export function Ok<Ok, Err extends ErrEnum>(ok: Ok): Result<Ok, Err> {
  return { success: true, ok };
}
