export function CoachPoster({className=''}:{className?:string}) {
  return <svg className={'coach-poster '+className} viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustrated preview of Alex, your AI practice coach">
    <rect width="800" height="600" fill="var(--hold-tint)"/>
    <path d="M0 450h800M0 150h800M200 0v600M600 0v600" stroke="var(--hold)" opacity=".12"/>
    <rect x="60" y="64" width="76" height="8" rx="4" fill="var(--hold)" opacity=".3"/>
    <rect x="60" y="84" width="45" height="8" rx="4" fill="var(--hold)" opacity=".14"/>
    <circle cx="400" cy="260" r="180" fill="var(--paper)"/>
    <path d="M182 600v-80c0-102 73-161 218-161s218 59 218 161v80" fill="var(--ink)"/>
    <path d="M315 379l85 69 85-69-28 221H343z" fill="var(--raised)"/>
    <path d="M356 322v69l44 34 44-34v-69" fill="var(--gap-tint)"/>
    <path d="M316 198c0-67 35-104 84-104s84 37 84 104v72c0 61-40 99-84 99s-84-38-84-99z" fill="var(--gap-tint)"/>
    <path d="M311 221v-49c0-60 39-99 93-99 59 0 88 40 88 91v46l-29-19-10-48c-41 26-80 33-116 18l-10 60z" fill="var(--ink)"/>
    <path d="M355 232h21m48 0h21" stroke="var(--ink)" strokeWidth="7" strokeLinecap="round"/>
    <path d="M397 247l-7 31h17M377 307c15 9 31 9 46 0" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round"/>
    <path d="M315 379l-43 43 57 31-23 34 39 113m140-221 43 43-57 31 23 34-39 113" fill="none" stroke="var(--hold)" strokeWidth="4"/>
    <rect x="520" y="483" width="22" height="8" rx="2" fill="var(--hold)"/>
  </svg>;
}
