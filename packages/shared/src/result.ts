export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T, E = string>(value: T): Result<T, E> => ({
  ok: true,
  value,
});

export const err = <E, T = never>(error: E): Result<T, E> => ({
  ok: false,
  error,
});

export const isOk = <T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } =>
  result.ok === true;

export const isErr = <T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } =>
  result.ok === false;