import { EmptyState } from "@/components/ui/empty-state";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

type NoteListProps = {
  notes: {
    id: string;
    content: string;
    createdAt: Date;
    author: { firstName: string; lastName: string };
  }[];
};

export function NoteList({ notes }: NoteListProps) {
  if (notes.length === 0) {
    return <EmptyState title="Noch keine Notizen vorhanden." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note) => (
        <li key={note.id} className="rounded-md border border-black/10 p-3">
          <p className="text-sm whitespace-pre-wrap text-black/80">{note.content}</p>
          <p className="mt-2 text-xs text-muted">
            {note.author.firstName} {note.author.lastName} ·{" "}
            {DATE_TIME_FORMATTER.format(note.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
