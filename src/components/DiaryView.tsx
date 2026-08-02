import { Entry } from '../types';
import { ViewMode } from '../lib/mode';
import { DiaryHeader } from './DiaryHeader';
import { Composer } from './Composer';
import { EntryList } from './EntryList';
import './DiaryView.css';

interface DiaryViewProps {
  entries: Entry[];
  searchQuery: string;
  selectedTags: string[];
  composerText: string;
  editingId: string | null;
  editText: string;
  mode: ViewMode;
  onSearchChange: (query: string) => void;
  onComposerTextChange: (text: string) => void;
  onComposerBlur: () => void;
  onEditTextChange: (text: string) => void;
  onEditSave: () => void;
  onTagClick: (tag: string) => void;
  onEntryRemove: (id: string) => void;
  onEntryClickToEdit: (id: string) => void;
  onHamburgerClick: () => void;
}

export function DiaryView(props: DiaryViewProps) {
  return (
    <div className="diary-view">
      <DiaryHeader
        searchQuery={props.searchQuery}
        onSearchChange={props.onSearchChange}
        onHamburgerClick={props.onHamburgerClick}
      />

      <div className="diary-content">
        {props.mode === 'all' && (
          <Composer
            text={props.composerText}
            onTextChange={props.onComposerTextChange}
            onBlur={props.onComposerBlur}
          />
        )}

        <EntryList
          entries={props.entries}
          mode={props.mode}
          selectedTags={props.selectedTags}
          searchQuery={props.searchQuery}
          editingId={props.editingId}
          editText={props.editText}
          onEditTextChange={props.onEditTextChange}
          onEditSave={props.onEditSave}
          onTagClick={props.onTagClick}
          onRemove={props.onEntryRemove}
          onClickToEdit={props.onEntryClickToEdit}
        />
      </div>
    </div>
  );
}
