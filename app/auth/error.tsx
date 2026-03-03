"use client";

export default function AuthError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <p>We ran into a problem loading this auth page.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
