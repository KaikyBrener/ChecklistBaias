function IconeMarca() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <path d="M14.5 17.5l2.2 2.2 4-4.4" />
    </svg>
  );
}

export function Marca() {
  return (
    <span className="marca" translate="no">
      <span className="logo" aria-hidden="true"><IconeMarca /></span>
      <span className="marca-txt"><b>Checklist de baias</b><small>Centrais de monitoramento</small></span>
    </span>
  );
}
