import React, { useState } from 'react';
import { Project } from '../types';
import './ProjectPicker.css';

interface ProjectPickerProps {
  projects: Project[];
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
}

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  projects,
  onCreate,
  onDelete,
  onOpen,
}) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setCreateError('Project name cannot be empty');
      return;
    }

    setIsCreating(true);
    setCreateError(undefined);

    try {
      await onCreate(newProjectName);
      setNewProjectName('');
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Failed to create project'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await onDelete(id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      console.error('Delete error:', errorMessage);
      // Could show error in UI here if needed
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateProject();
    }
  };

  return (
    <div className="project-picker">
      <div className="project-list-section">
        <h2 className="project-list-title">Your Projects</h2>

        {projects.length === 0 ? (
          <p className="no-projects-message">No projects yet. Create one below to get started.</p>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <div key={project.id} className="project-item">
                <div className="project-info">
                  <h3 className="project-name">{project.name}</h3>
                  <p className="project-meta">
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="project-actions">
                  <button
                    className="project-button project-open-button"
                    onClick={() => onOpen(project.id)}
                    title={`Open ${project.name}`}
                  >
                    Open
                  </button>
                  <button
                    className="project-button project-delete-button"
                    onClick={() => handleDeleteProject(project.id, project.name)}
                    title={`Delete ${project.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="create-project-section">
        <h2 className="create-project-title">Create New Project</h2>

        <div className="create-form">
          <input
            type="text"
            className="create-input"
            placeholder="Enter project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isCreating}
          />
          <button
            className="create-button"
            onClick={handleCreateProject}
            disabled={isCreating || !newProjectName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>

        {createError && <p className="create-error">{createError}</p>}
      </div>
    </div>
  );
};
