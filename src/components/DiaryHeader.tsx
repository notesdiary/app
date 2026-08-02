import './DiaryHeader.css';

interface DiaryHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onHamburgerClick: () => void;
}

export function DiaryHeader(props: DiaryHeaderProps) {
  return (
    <header className="diary-header">
      <button className="hamburger-button" onClick={props.onHamburgerClick} title="Menu">
        ☰
      </button>

      <input
        type="text"
        className="search-input"
        placeholder="Search entries..."
        value={props.searchQuery}
        onChange={(e) => props.onSearchChange(e.target.value)}
      />
    </header>
  );
}
