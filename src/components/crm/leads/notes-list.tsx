import { formatDateTime } from "@/lib/format";
import type { Note } from "@/lib/types/domain";

export function NotesList({ notes, timezone }: { notes: Note[]; timezone: string }) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-md border p-3">
          <p className="whitespace-pre-wrap text-sm">{note.content}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {note.author?.full_name || note.author?.email || "Unknown"} ·{" "}
            {formatDateTime(note.created_at, timezone)}
          </p>
        </div>
      ))}
    </div>
  );
}
