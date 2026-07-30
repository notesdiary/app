import { useEffect, useState } from 'react';
import { Entry } from '../types';
import { formatTime, formatDate } from '../lib/dateUtils';
import { listAllArchivedEntries, restoreEntry, deleteEntryForever } from '../lib/entriesRepo';
import { EntryContent } from './EntryContent';
import './ArchiveView.css';

interface ArchiveViewProps {
  onBackClick: () => void;
}

interface MonthGroup {
  yearMonth: string;
  monthName: string;
  year: number;
  entries: Entry[];
}

export function ArchiveView(props: ArchiveViewProps) {
  const [archivedEntries, setArchivedEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load archived entries on mount
  useEffect(() => {
    (async () => {
      try {
        const entries = await listAllArchivedEntries();
        setArchivedEntries(entries);
      } catch (error) {
        console.error('Failed to load archived entries:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRestore = async (id: string) => {
    try {
      await restoreEntry(id);
      setArchivedEntries(archivedEntries.filter(e => e.id !== id));
    } catch (error) {
      console.error('Failed to restore entry:', error);
    }
  };

  const handleDeleteForever = async (id: string) => {
    try {
      await deleteEntryForever(id);
      setArchivedEntries(archivedEntries.filter(e => e.id !== id));
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  // Group entries by month
  const groupByMonth = (): MonthGroup[] => {
    const groups: Record<string, Entry[]> = {};

    archivedEntries.forEach(entry => {
      const yearMonth = entry.date.slice(0, 7);
      if (!groups[yearMonth]) {
        groups[yearMonth] = [];
      }
      groups[yearMonth].push(entry);
    });

    // Sort each group by date desc, then time desc
    Object.keys(groups).forEach(yearMonth => {
      groups[yearMonth].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.time.localeCompare(a.time);
      });
    });

    // Create result with month names
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0])) // Sort months descending (newest first)
      .map(([yearMonth, entries]) => {
        const [year, month] = yearMonth.split('-');
        const monthIndex = parseInt(month, 10) - 1;
        return {
          yearMonth,
          monthName: months[monthIndex],
          year: parseInt(year, 10),
          entries,
        };
      });
  };

  const monthGroups = groupByMonth();

  if (loading) {
    return (
      <div className="archive-view">
        <div className="archive-header">
          <button className="back-button" onClick={props.onBackClick} title="Back to diary">
            ← Back to diary
          </button>
        </div>
        <div className="archive-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="archive-view">
      <div className="archive-header">
        <button className="back-button" onClick={props.onBackClick} title="Back to diary">
          ← Back to diary
        </button>
      </div>

      <div className="archive-content">
        <div className="archive-title-section">
          <h1 className="archive-title">Archive</h1>
          <p className="archive-subtitle">
            Removed entries land here instead of being deleted, grouped one document per month to match your Drive backups. Restore them or delete them for good.
          </p>
        </div>

        {monthGroups.length === 0 ? (
          <div className="empty-state">
            <p>Nothing archived.</p>
          </div>
        ) : (
          <div className="month-groups">
            {monthGroups.map(group => (
              <div key={group.yearMonth} className="month-group">
                <div className="month-header">
                  <span className="document-icon">📄</span>
                  <span className="month-title">{group.monthName} {group.year}.json</span>
                  <span className="entry-count-label">
                    {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                <div className="entries-in-group">
                  {group.entries.map((entry, index) => {
                    const { md } = formatDate(entry.date);
                    const timeFormatted = formatTime(entry.time);

                    return (
                      <div key={entry.id}>
                        <div className="archive-entry">
                          <div className="entry-header">
                            <div className="entry-time">{timeFormatted}</div>
                            <div className="entry-date">{md}</div>
                          </div>

                          <EntryContent text={entry.text} interactive={false} />

                          <div className="entry-actions">
                            <button
                              className="restore-button"
                              onClick={() => handleRestore(entry.id)}
                            >
                              Restore
                            </button>
                            <button
                              className="delete-forever-button"
                              onClick={() => handleDeleteForever(entry.id)}
                            >
                              Delete forever
                            </button>
                          </div>
                        </div>

                        {index < group.entries.length - 1 && <div className="entry-divider" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
