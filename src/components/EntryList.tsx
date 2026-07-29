import { Entry } from '../types';
import { ViewMode } from '../lib/mode';
import { EntryRow } from './EntryRow';
import './EntryList.css';

interface EntryListProps {
  entries: Entry[];
  mode: ViewMode;
  selectedTags: string[];
  searchQuery: string;
  editingId: string | null;
  editText: string;
  onEditTextChange: (text: string) => void;
  onEditSave: () => void;
  onTagClick: (tag: string) => void;
  onRemove: (id: string) => void;
  onClickToEdit: (id: string) => void;
}

export function EntryList(props: EntryListProps) {
  if (props.entries.length === 0) {
    return <div className="entry-list-empty">No entries here yet.</div>;
  }

  return (
    <div className="entry-list">
      {props.entries.map(entry => (
        <EntryRow
          key={entry.id}
          entry={entry}
          mode={props.mode}
          selectedTags={props.selectedTags}
          searchQuery={props.searchQuery}
          isEditing={props.editingId === entry.id}
          editText={props.editText}
          onEditTextChange={props.onEditTextChange}
          onEditSave={props.onEditSave}
          onTagClick={(tag, e) => props.onTagClick(tag)}
          onRemove={() => props.onRemove(entry.id)}
          onClickToEdit={() => props.onClickToEdit(entry.id)}
        />
      ))}
    </div>
  );
}
