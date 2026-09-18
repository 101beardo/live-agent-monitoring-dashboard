export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state">
      {message}
      <button type="button" className="btn-ghost" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
