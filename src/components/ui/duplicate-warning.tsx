type DuplicateWarningProps = {
  title: string;
  items: string[];
};

// Generisch: zeigt nur eine Liste von Textzeilen - kennt nichts von Company/
// Contact/Matchtyp-Logik. Warnt, blockiert aber nie das Absenden.
export function DuplicateWarning({ title, items }: DuplicateWarningProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900"
      role="alert"
    >
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-inside list-disc">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
