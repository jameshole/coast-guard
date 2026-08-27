/** Full-screen "server offline" state shown while the WebSocket reconnects. */
export function ServerOffline() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-secondary)',
      gap: '16px',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '3px solid var(--border-color)',
        borderTopColor: 'var(--text-secondary)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
        Server offline
      </div>
      <div style={{ fontSize: '13px' }}>
        Waiting for server to reconnect...
      </div>
    </div>
  );
}
