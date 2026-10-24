export type NoteWithTarget = { note_id: number; target_kind: string; target_key: string; body: string; status: string; created_at: Date };

export function noteHref(n: NoteWithTarget): string {
  switch (n.target_kind) {
    case 'part':
      return `/part/${n.target_key}`;
    case 'model':
      return `/model/${n.target_key}`;
    case 'vehicle':
      return `/model/${n.target_key.split(':')[1]}`;
    case 'concept':
      return `/concept/${n.target_key}`;
    default:
      return '/notes';
  }
}

export const noteTarget = (n: NoteWithTarget) => (n.target_kind === 'general' ? 'General' : `${n.target_kind} ${n.target_key}`);
