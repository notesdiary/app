import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitPartsWithDate, splitSections, parseSectionDate, AlreadyEmitted } from '../lib/tags';
import { formatDateWithYear } from '../lib/dateUtils';

interface EntryContentProps {
  text: string;
  interactive: boolean;
  onTagClick?: (tag: string, e: React.MouseEvent) => void;
  onSectionClick?: () => void;
  onDateClick?: (date: string, e: React.MouseEvent) => void;
}

export const EntryContent: React.FC<EntryContentProps> = ({
  text,
  interactive,
  onTagClick,
  onSectionClick,
  onDateClick,
}) => {
  const sections = splitSections(text);

  return (
    <div className="entry-paragraphs">
      {sections.map((section, sectionIdx) => {
        const acceptedIso = parseSectionDate(section);
        const alreadyEmitted: AlreadyEmitted = { done: false };

        const renderTagsInText = (textContent: string): React.ReactNode => {
          const parts = splitPartsWithDate(textContent, acceptedIso, alreadyEmitted);

          return (
            <>
              {parts.map((part, idx) => {
                if (part.isDate) {
                  if (interactive) {
                    return (
                      <button
                        key={idx}
                        className="date-pill"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onDateClick?.(part.date!, e);
                        }}
                      >
                        {formatDateWithYear(part.date!)}
                      </button>
                    );
                  } else {
                    return (
                      <span key={idx} className="date-pill-text">
                        {formatDateWithYear(part.date!)}
                      </span>
                    );
                  }
                } else if (part.isTag) {
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
          <div
            key={sectionIdx}
            className="entry-paragraph"
            onClick={interactive ? onSectionClick : undefined}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {section}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
};
