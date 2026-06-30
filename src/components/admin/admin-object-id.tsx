export function AdminObjectId({ id, kind, visible }: { id?: string | null; kind: string; visible?: boolean }) {
  if (!visible || !id) return null;

  return (
    <code className="admin-object-id" title={`${kind} database ID: ${id}`}>
      {kind} ID: {id}
    </code>
  );
}
