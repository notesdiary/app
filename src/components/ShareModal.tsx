import { useEffect, useRef, useState } from 'react';
import './ShareModal.css';

export type PersonRole = 'viewer' | 'commenter' | 'editor';
export type GeneralAccess = 'restricted' | 'anyone';

export interface SharePerson {
  permissionId: string;
  email: string;
  displayName?: string;
  role: 'owner' | PersonRole;
}

export interface ShareFileState {
  isLoading: boolean;
  loadError?: string;
  generalAccess: GeneralAccess;
  generalRole: PersonRole;
  generalPermissionId?: string;
  people: SharePerson[];
}

export interface ShareModalProps {
  fileId: string;
  fileName: string;
  token: string;
  state: ShareFileState;
  onLoad: () => Promise<void>;
  onInvite: (email: string) => Promise<void>;
  onRoleChange: (permissionId: string, role: PersonRole) => Promise<void>;
  onRemove: (permissionId: string) => Promise<void>;
  onGeneralAccessChange: (access: GeneralAccess) => Promise<void>;
  onGeneralRoleChange: (role: PersonRole) => Promise<void>;
  onCopyLink: () => void;
  onClose: () => void;
}

// UI role -> Drive role: viewer->reader, commenter->commenter, editor->writer, owner->owner
export function toDriveRole(role: PersonRole | 'owner'): string {
  switch (role) {
    case 'viewer':
      return 'reader';
    case 'commenter':
      return 'commenter';
    case 'editor':
      return 'writer';
    case 'owner':
      return 'owner';
    default:
      return role;
  }
}

// Drive role -> UI role: reader->viewer, commenter->commenter, writer->editor, owner->owner
export function fromDriveRole(driveRole: string): PersonRole | 'owner' {
  switch (driveRole) {
    case 'reader':
      return 'viewer';
    case 'commenter':
      return 'commenter';
    case 'writer':
      return 'editor';
    case 'owner':
      return 'owner';
    default:
      return 'viewer';
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10.5" cy="3" r="1.8" stroke="#53565A" strokeWidth="1.2" />
      <circle cx="10.5" cy="11" r="1.8" stroke="#53565A" strokeWidth="1.2" />
      <circle cx="3.5" cy="7" r="1.8" stroke="#53565A" strokeWidth="1.2" />
      <line x1="5" y1="6.2" x2="9" y2="3.8" stroke="#53565A" strokeWidth="1.2" />
      <line x1="5" y1="7.8" x2="9" y2="10.2" stroke="#53565A" strokeWidth="1.2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.2 7.8L7.8 5.2"
        stroke="#53565A"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M6.2 3.5L7 2.7A2 2 0 1 1 9.8 5.5L9 6.3"
        stroke="#53565A"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M6.8 9.5L6 10.3A2 2 0 1 1 3.2 7.5L4 6.7"
        stroke="#53565A"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="3" x2="13" y2="13" stroke="#53565A" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="#53565A" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function RoleSelect(props: {
  value: PersonRole;
  onChange: (role: PersonRole) => void;
  className?: string;
}) {
  return (
    <select
      className={props.className}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as PersonRole)}
    >
      <option value="viewer">Viewer</option>
      <option value="commenter">Commenter</option>
      <option value="editor">Editor</option>
    </select>
  );
}

export function ShareModal(props: ShareModalProps) {
  const { state } = props;

  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | undefined>(undefined);

  const [copyLabel, setCopyLabel] = useState('Copy link');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleOverlayClick = () => {
    props.onClose();
  };

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleInviteClick = async () => {
    if (!EMAIL_REGEX.test(inviteEmail)) {
      return;
    }
    setIsInviting(true);
    setInviteError(undefined);
    try {
      await props.onInvite(inviteEmail);
      setInviteEmail('');
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Failed to invite person');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopyLinkClick = () => {
    props.onCopyLink();
    setCopyLabel('Link copied');
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopyLabel('Copy link');
    }, 1500);
  };

  const isEmailValid = EMAIL_REGEX.test(inviteEmail);

  return (
    <div className="share-modal-overlay" onClick={handleOverlayClick}>
      <div className="share-modal-panel" onClick={handlePanelClick}>
        <div className="share-modal-header">
          <span className="share-modal-header-icon">
            <ShareIcon />
          </span>
          <h2 className="share-modal-title">Share "{props.fileName}"</h2>
          <button
            className="share-modal-close-button"
            onClick={props.onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="share-modal-people">
          <div className="share-modal-eyebrow">PEOPLE WITH ACCESS</div>

          {state.isLoading ? (
            <p className="share-modal-loading">Loading…</p>
          ) : state.loadError ? (
            <p className="share-modal-error">{state.loadError}</p>
          ) : (
            <div className="share-modal-people-list">
              {state.people.map((person) => (
                <div key={person.permissionId} className="share-modal-person-row">
                  <span className="share-modal-person-avatar">
                    {person.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="share-modal-person-email">{person.email}</span>
                  {person.role === 'owner' ? (
                    <span className="share-modal-person-owner">Owner</span>
                  ) : (
                    <div className="share-modal-person-controls">
                      <RoleSelect
                        className="share-modal-person-role-select"
                        value={person.role}
                        onChange={(newRole) => props.onRoleChange(person.permissionId, newRole)}
                      />
                      <button
                        className="share-modal-person-remove-button"
                        onClick={() => props.onRemove(person.permissionId)}
                        aria-label={`Remove ${person.email}`}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="share-modal-invite-row">
          <input
            type="email"
            className="share-modal-invite-input"
            placeholder="Add people by email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <button
            className="share-modal-invite-button"
            onClick={handleInviteClick}
            disabled={!isEmailValid || isInviting}
          >
            {isInviting ? 'Inviting…' : 'Invite'}
          </button>
        </div>
        {inviteError && <p className="share-modal-invite-error">{inviteError}</p>}

        <div className="share-modal-general-access">
          <div className="share-modal-eyebrow">GENERAL ACCESS</div>
          <select
            className="share-modal-general-access-select"
            value={state.generalAccess}
            onChange={(e) => props.onGeneralAccessChange(e.target.value as GeneralAccess)}
          >
            <option value="restricted">Restricted</option>
            <option value="anyone">Anyone with the link</option>
          </select>

          {state.generalAccess === 'anyone' && (
            <RoleSelect
              className="share-modal-general-role-select"
              value={state.generalRole}
              onChange={(newRole) => props.onGeneralRoleChange(newRole)}
            />
          )}
        </div>

        <div className="share-modal-footer">
          <button className="share-modal-copy-link-button" onClick={handleCopyLinkClick}>
            <LinkIcon />
            {copyLabel}
          </button>
          <button className="share-modal-done-button" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
