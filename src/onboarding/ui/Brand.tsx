import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

export function Brand(){return <header className="site-header"><Link href="/" className="wordmark" aria-label="Holdline home"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h5v18H3zM10 10h11v5H10z" fill="currentColor"/></svg>holdline<span className="brand-period">.</span></Link><span className="header-note"><LockKeyhole size={14} strokeWidth={1.5} aria-hidden="true"/>Your practice, your pace</span></header>;}
