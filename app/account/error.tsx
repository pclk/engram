"use client";

export default function AccountError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <p>We ran into a problem loading account settings.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
