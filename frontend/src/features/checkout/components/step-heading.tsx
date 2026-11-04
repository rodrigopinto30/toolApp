export function StepHeading({ id, step, children }: { id: string; step: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-lg font-semibold">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brand-foreground"
      >
        {step}
      </span>
      {children}
    </h2>
  );
}
