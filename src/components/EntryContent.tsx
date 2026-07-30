import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitParts, splitSections } from '../lib/tags';

interface EntryContentProps {
  text: string;
  interactive: boolean;
  onTagClick?: (tag: string, e: React.MouseEvent) => void;
  onSectionClick?: () => void;
}

export const EntryContent: React.FC<EntryContentProps> = ({
  text,
  interactive,
  onTagClick,
  onSectionClick,
}) => {
  const sections = splitSections(text);

  const renderTagsInText = (textContent: string): React.ReactNode => {
    const parts = splitParts(textContent);

    return (
      <>
        {parts.map((part, idx) => {
          if (part.isTag) {
            if (interactive) {
              return (
                <button
                  key={idx}
                  className="tag-link"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onTagClick?.(part.text, e);
                  }}
                >
                  {part.text}
                </button>
              );
            } else {
              return (
                <span key={idx} className="tag-text">
                  {part.text}
                </span>
              );
            }
          } else {
            return part.text;
          }
        })}
      </>
    );
  };

  const wrapWithTagSupport = (Component: React.ElementType) => {
    return (props: any) => {
      let processedChildren = props.children;

      if (Array.isArray(props.children)) {
        processedChildren = props.children.map((child: any, idx: number) => {
          if (typeof child === 'string') {
            return <React.Fragment key={idx}>{renderTagsInText(child)}</React.Fragment>;
          }
          return child;
        });
      } else if (typeof props.children === 'string') {
        processedChildren = renderTagsInText(props.children);
      }

      return <Component {...props}>{processedChildren}</Component>;
    };
  };

  const components = {
    p: wrapWithTagSupport('p'),
    strong: wrapWithTagSupport('strong'),
    em: wrapWithTagSupport('em'),
    code: wrapWithTagSupport('code'),
    del: wrapWithTagSupport('del'),
    blockquote: wrapWithTagSupport('blockquote'),
    li: wrapWithTagSupport('li'),
    h1: wrapWithTagSupport('h1'),
    h2: wrapWithTagSupport('h2'),
    h3: wrapWithTagSupport('h3'),
    h4: wrapWithTagSupport('h4'),
    h5: wrapWithTagSupport('h5'),
    h6: wrapWithTagSupport('h6'),
    img(props: { alt?: string; src?: string }) {
      return (
        <span className="md-image-placeholder">
          {props.alt || props.src || ''}
        </span>
      );
    },
    a(props: { children: React.ReactNode; href?: string; [key: string]: any }) {
      return (
        <a
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {props.children}
        </a>
      );
    },
  };

  return (
    <div className="entry-paragraphs">
      {sections.map((section, idx) => (
        <div
          key={idx}
          className="entry-paragraph"
          onClick={interactive ? onSectionClick : undefined}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {section}
          </ReactMarkdown>
        </div>
      ))}
    </div>
  );
};
