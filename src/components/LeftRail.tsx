import { useState } from 'react';
import { Entry } from '../types';
import { getTodayISO, formatDate } from '../lib/dateUtils';
import './LeftRail.css';

interface LeftRailProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onAddExtraDate: (date: string) => void;
  entries: Entry[];
  extraDates: string[];
  onSettingsClick: () => void;
  onArchiveClick: () => void;
  onAboutClick: () => void;
  isMobile: boolean;
  isOpen: boolean;
}

export function LeftRail(props: LeftRailProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const today = getTodayISO();
  const allDates = new Set<string>();

  // Add dates from entries
  props.entries.forEach(e => allDates.add(e.date));

  // Add extra dates
  props.extraDates.forEach(d => allDates.add(d));

  // Always include today
  allDates.add(today);

  // Sort dates in descending order
  const sortedDates = Array.from(allDates).sort((a, b) => b.localeCompare(a));

  // Count entries per date
  const dateEntryCount: Record<string, number> = {};
  props.entries.forEach(e => {
    dateEntryCount[e.date] = (dateEntryCount[e.date] || 0) + 1;
  });

  const handleDatePick = (date: string) => {
    props.onAddExtraDate(date);
    props.onSelectDate(date);
    setShowDatePicker(false);
    if (props.isMobile) {
      // Caller will close drawer
    }
  };

  return (
    <div className={`left-rail ${props.isMobile ? 'mobile' : 'desktop'} ${props.isOpen ? 'open' : 'closed'}`}>
      <div className="left-rail-header">
        <div className="app-logo">N</div>
        <div className="app-title">Notes Diary</div>
      </div>

      <div className="entries-by-date-section">
        <div className="section-header">
          <span>Entries by date</span>
          <button
            className="add-date-button"
            onClick={() => setShowDatePicker(!showDatePicker)}
            title="Add a date"
          >
            +
          </button>
        </div>

        {showDatePicker && (
          <div className="date-picker-wrapper">
            <input
              type="date"
              onChange={(e) => {
                if (e.target.value) {
                  handleDatePick(e.target.value);
                  e.target.value = '';
                }
              }}
              autoFocus
            />
          </div>
        )}

        <div className="date-list">
          {sortedDates.map(date => {
            const { weekday, md } = formatDate(date);
            const count = dateEntryCount[date] || 0;
            const isToday = date === today;
            const isSelected = date === props.selectedDate;

            return (
              <button
                key={date}
                className={`date-item ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  props.onSelectDate(date);
                  if (props.isMobile && props.isOpen) {
                    // Signal to close drawer
                  }
                }}
              >
                <div className="date-content">
                  <div className="date-text">
                    {weekday}, {md}
                  </div>
                  {isToday && <span className="today-badge">Today</span>}
                </div>
                {count > 0 && <div className="entry-count">{count}</div>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="left-rail-footer">
        <button className="nav-button" onClick={props.onArchiveClick}>
          Archive
        </button>
        <button className="nav-button" onClick={props.onSettingsClick}>
          Settings
        </button>
        <button className="nav-button" onClick={props.onAboutClick}>
          About
        </button>
      </div>
    </div>
  );
}
