/** Card with a mono title bar. Only for records: a round, a transcript, a debrief. */
export function WindowCard({ file, step, children, className = '', style }: { file: string; step?: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`win ${className}`} style={style}>
      <div className="win-chrome" aria-hidden>
        <i />
        <i />
        <span className="ml-2">{file}</span>
        {step && <span className="ml-auto">{step}</span>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
