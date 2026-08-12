'use client';
// Placeholder — the real export buttons (member data export, Art. 18 II/V) land
// in Task 10. This exists only so the dados page typechecks and renders on its
// own in this task.
export function ExportButtons({ contactId }: { contactId: string }) {
  return <div data-contact={contactId} />;
}
