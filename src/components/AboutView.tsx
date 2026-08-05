import './AboutView.css';

interface AboutViewProps {
  onBack: () => void;
}

export function AboutView(props: AboutViewProps) {
  return (
    <div className="about-view">
      <div className="about-header">
        <button className="back-button" onClick={props.onBack} title="Back to diary">
          ← Back to diary
        </button>
      </div>

      <div className="about-content">
        <div className="about-title-section">
          <h1 className="about-title">How does the app work?</h1>
        </div>

        <div className="about-card">
          <div className="about-section">
            <h3 className="about-subsection-title">Your data privacy</h3>
            <p className="about-text">
              Your notes are stored locally in your browser. <strong>Data never leaves your device</strong> unless you choose to connect Google Drive.
            </p>
          </div>

          <div className="about-section">
            <h3 className="about-subsection-title">Google Drive backup</h3>
            <p className="about-text">
              When you connect Google Drive, your notes are backed up to your Drive account. The connection is secure and encrypted.
            </p>
            <ul className="about-list">
              <li>Backups only go to your Google Drive account</li>
              <li>This app only has access to files it creates or modifies — it cannot access your other Drive files</li>
            </ul>
          </div>

          <div className="about-section">
            <h3 className="about-subsection-title">Authentication & credentials</h3>
            <p className="about-text">
              Your Google authentication is stored only in your browser. Your credentials and personal data are never stored on our servers or anywhere else.
            </p>
          </div>

          <div className="about-section">
            <h3 className="about-subsection-title">Multiple projects (work, personal, etc.)</h3>
            <p className="about-text">
              Keep different sets of notes completely separate by creating multiple projects:
            </p>
            <ul className="about-list">
              <li>Create a project for work — store work notes with their own settings and Drive connection</li>
              <li>Create another project for personal — keep personal notes in a separate space</li>
              <li>Each project has its own local storage, settings, and can sync to a different Google Drive account</li>
              <li>Switch between projects instantly without changing browser profiles</li>
            </ul>
            <p className="about-text">
              This approach keeps your work and personal notes in completely separate spaces with no cross-contamination — all in one browser.
            </p>
          </div>

          <div className="about-section">
            <h3 className="about-subsection-title">How to share notes</h3>
            <p className="about-text">
              You can selectively share notes with others by using filters. Here's how:
            </p>
            <ol className="about-ordered-list">
              <li>Go to Settings and connect Google Drive</li>
              <li>Switch from "Sync all" to "Sync with filters"</li>
              <li>Create a filter for each audience (e.g., #team, #personal, #project-x)</li>
              <li>Only entries matching those filters are backed up to Google Drive</li>
              <li>Share the specific Drive file with others using Google Drive's sharing features</li>
            </ol>
            <p className="about-text">
              This way, only the content you want to share gets stored in Drive, and you control exactly who has access.
            </p>
          </div>

          <div className="about-section">
            <h3 className="about-subsection-title">Summary</h3>
            <ul className="about-list">
              <li>✓ All data stays local by default</li>
              <li>✓ Google Drive backups are optional</li>
              <li>✓ Limited Drive access — only files created by this app</li>
              <li>✓ Authentication stored only in your browser</li>
              <li>✓ Share selectively via filters and Google Drive</li>
              <li>✓ Multiple projects for work, personal, and more</li>
              <li>✓ No tracking, no analytics, no ads</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
