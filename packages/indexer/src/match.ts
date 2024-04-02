/**
 * The constructs here allow us to mimic Rust's strongly typed error handling
 */
export type TaggedUnion = {
  type: string;
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

// Define the match function
export function match<Ok, Err extends TaggedUnion, T>(
  result: Result<Ok, Err>,
  okHandler: (ok: Ok) => T,
  errorHandler: (err: Err) => T
): T {
  if (result.success) {
    return okHandler(result.ok);
  } else {
    return errorHandler(result.error);
  }
}
