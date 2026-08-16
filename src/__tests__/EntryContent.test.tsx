import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { EntryContent } from '../components/EntryContent';

describe('EntryContent', () => {
  // Test 1: Bold text renders inside a <strong> tag
  it('should render bold text inside a <strong> tag', () => {
    render(<EntryContent text="**bold**" interactive={false} />);
    const strong = screen.getByText('bold').closest('strong');
    expect(strong).toBeInTheDocument();
  });

  // Test 2: Italic text renders inside <em>
  it('should render italic text inside <em>', () => {
    render(<EntryContent text="*italic*" interactive={false} />);
    const em = screen.getByText('italic').closest('em');
    expect(em).toBeInTheDocument();
  });

  // Test 3: Strikethrough (GFM) renders inside <del> or <s>
  it('should render strikethrough text inside <del> or <s>', () => {
    render(<EntryContent text="~~gone~~" interactive={false} />);
    const text = screen.getByText('gone');
    const parent = text.closest('del') || text.closest('s');
    expect(parent).toBeInTheDocument();
  });

  // Test 4: Inline code renders inside <code>
  it('should render inline code inside <code>', () => {
    render(<EntryContent text="`code`" interactive={false} />);
    const code = screen.getByText('code').closest('code');
    expect(code).toBeInTheDocument();
  });

  // Test 5: Fenced code block renders <pre><code>
  it('should render fenced code block inside <pre><code>', () => {
    // Use a markdown string with proper fenced code block syntax
    const text = `\`\`\`
code block
\`\`\``;
    const { container } = render(
      <EntryContent text={text} interactive={false} />
    );
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain('code block');
  });

  // Test 6: Blockquote renders <blockquote>
  it('should render blockquote inside <blockquote>', () => {
    const { container } = render(<EntryContent text="> quoted" interactive={false} />);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeInTheDocument();
    expect(blockquote?.textContent).toContain('quoted');
  });

  // Test 7: Unordered list renders <ul><li>
  it('should render unordered list inside <ul><li>', () => {
    const { container } = render(<EntryContent text="- item one" interactive={false} />);
    const ul = container.querySelector('ul');
    const li = screen.getByText('item one').closest('li');
    expect(ul).toBeInTheDocument();
    expect(li).toBeInTheDocument();
  });

  // Test 8: Ordered list renders <ol><li>
  it('should render ordered list inside <ol><li>', () => {
    const { container } = render(<EntryContent text="1. item one" interactive={false} />);
    const ol = container.querySelector('ol');
    const li = screen.getByText('item one').closest('li');
    expect(ol).toBeInTheDocument();
    expect(li).toBeInTheDocument();
  });

  // Test 9: Headings h1 through h6 render matching tags
  it('should render h1 heading', () => {
    const { container } = render(<EntryContent text="# H1" interactive={false} />);
    expect(container.querySelector('h1')?.textContent).toContain('H1');
  });

  it('should render h2 heading', () => {
    const { container } = render(<EntryContent text="## H2" interactive={false} />);
    expect(container.querySelector('h2')?.textContent).toContain('H2');
  });

  it('should render h3 heading', () => {
    const { container } = render(<EntryContent text="### H3" interactive={false} />);
    expect(container.querySelector('h3')?.textContent).toContain('H3');
  });

  it('should render h4 heading', () => {
    const { container } = render(<EntryContent text="#### H4" interactive={false} />);
    expect(container.querySelector('h4')?.textContent).toContain('H4');
  });

  it('should render h5 heading', () => {
    const { container } = render(<EntryContent text="##### H5" interactive={false} />);
    expect(container.querySelector('h5')?.textContent).toContain('H5');
  });

  it('should render h6 heading', () => {
    const { container } = render(<EntryContent text="###### H6" interactive={false} />);
    expect(container.querySelector('h6')?.textContent).toContain('H6');
  });

  // Test 10: Link renders <a> with target="_blank" and rel="noopener noreferrer"
  it('should render link with target="_blank" and rel="noopener noreferrer"', () => {
    render(
      <EntryContent text="[text](https://example.com)" interactive={false} />
    );
    const link = screen.getByRole('link', { name: 'text' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // Test 11: Bare autolink (GFM) turns a bare URL into a link
  it('should render bare URL as a link via GFM autolink', () => {
    render(<EntryContent text="https://example.com" interactive={false} />);
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  // Test 12: Image never renders a real <img>
  it('should not render <img> element for markdown images', () => {
    const { container } = render(
      <EntryContent text="![alt text](http://x/y.png)" interactive={false} />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeInTheDocument();
    const placeholder = container.querySelector('.md-image-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.textContent).toBe('alt text');
  });

  // Test 13: Image with no alt falls back to URL text in placeholder
  it('should use URL as fallback text in image placeholder when alt is empty', () => {
    const { container } = render(<EntryContent text="![](http://x/y.png)" interactive={false} />);
    const placeholder = container.querySelector('.md-image-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.textContent).toBe('http://x/y.png');
  });

  // Test 14: Tag nested inside bold still renders as tag element
  it('should render tag element inside bold text', () => {
    const { container } = render(<EntryContent text="**#tag** bold" interactive={false} />);
    const tagSpan = container.querySelector('.tag-text');
    expect(tagSpan).toBeInTheDocument();
    expect(tagSpan?.textContent).toBe('#tag');
    // Verify it's inside a strong tag
    const strong = tagSpan?.closest('strong');
    expect(strong).toBeInTheDocument();
  });

  // Test 15: Tag nested inside a list item still renders as tag element
  it('should render tag element inside list item', () => {
    const { container } = render(<EntryContent text="- item #tag" interactive={false} />);
    const li = container.querySelector('li');
    const tagSpan = li?.querySelector('.tag-text');
    expect(tagSpan).toBeInTheDocument();
    expect(tagSpan?.textContent).toBe('#tag');
  });

  // Test 16: Tag nested inside a blockquote still renders as tag element
  it('should render tag element inside blockquote', () => {
    const { container } = render(<EntryContent text="> quote #tag" interactive={false} />);
    const blockquote = container.querySelector('blockquote');
    const tagSpan = blockquote?.querySelector('.tag-text');
    expect(tagSpan).toBeInTheDocument();
    expect(tagSpan?.textContent).toBe('#tag');
  });

  // Test 17: Plain tag with no markdown still renders as tag element
  it('should render tag element in plain text', () => {
    const { container } = render(<EntryContent text="plain #tag text" interactive={false} />);
    const tagSpan = container.querySelector('.tag-text');
    expect(tagSpan).toBeInTheDocument();
    expect(tagSpan?.textContent).toBe('#tag');
  });

  // Test 18: Interactive mode: clicking a tag calls onTagClick
  it('should call onTagClick when clicking tag in interactive mode', async () => {
    const onTagClick = vi.fn();
    const onSectionClick = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <EntryContent
        text="text #tag more"
        interactive={true}
        onTagClick={onTagClick}
        onSectionClick={onSectionClick}
      />
    );

    const tagButton = container.querySelector('.tag-link');
    expect(tagButton).toBeInTheDocument();

    await user.click(tagButton!);

    expect(onTagClick).toHaveBeenCalledWith('#tag', expect.any(Object));
    expect(onSectionClick).not.toHaveBeenCalled();
  });

  // Test 19: Interactive mode: clicking a link does not fire onSectionClick
  it('should not call onSectionClick when clicking a link in interactive mode', async () => {
    const onSectionClick = vi.fn();
    const user = userEvent.setup();

    render(
      <EntryContent
        text="[link](https://example.com)"
        interactive={true}
        onSectionClick={onSectionClick}
      />
    );

    const link = screen.getByRole('link');
    await user.click(link);

    expect(onSectionClick).not.toHaveBeenCalled();
  });

  // Test 20: Interactive mode: clicking the paragraph body calls onSectionClick
  it('should call onSectionClick when clicking paragraph in interactive mode', async () => {
    const onSectionClick = vi.fn();
    const user = userEvent.setup();

    render(
      <EntryContent
        text="plain text"
        interactive={true}
        onSectionClick={onSectionClick}
      />
    );

    const paragraph = document.querySelector('.entry-paragraph');
    await user.click(paragraph!);

    expect(onSectionClick).toHaveBeenCalled();
  });

  // Test 21: Read-only mode: no button elements render for tags
  it('should not render button elements for tags in read-only mode', () => {
    const { container } = render(<EntryContent text="#tag" interactive={false} />);
    const buttons = container.querySelectorAll('.tag-link');
    expect(buttons).toHaveLength(0);
    const tagSpan = container.querySelector('.tag-text');
    expect(tagSpan).toBeInTheDocument();
  });

  // Test 22: Read-only mode: paragraph div has no click handler
  it('should not crash when clicking paragraph in read-only mode', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <EntryContent text="plain text" interactive={false} />
    );

    const paragraph = container.querySelector('.entry-paragraph');
    expect(paragraph).toBeInTheDocument();

    // Should not crash
    await user.click(paragraph!);
  });

  // Test 23: Section splitting still applies inside EntryContent
  it('should split content into separate paragraphs on blank lines', () => {
    const text = 'line one\n\nline two';
    const { container } = render(
      <EntryContent
        text={text}
        interactive={false}
      />
    );

    const paragraphs = container.querySelectorAll('.entry-paragraph');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toContain('line one');
    expect(paragraphs[1].textContent).toContain('line two');
  });

  // Test 24: Regression test - trailing tag-only section renders as exactly two tag buttons with no stray text
  it('should render trailing tag-only section as exactly two tag-link buttons with no other visible text', () => {
    const { container } = render(
      <EntryContent
        text={'Went for a walk\n\n#health #outdoors'}
        interactive={true}
      />
    );

    const paragraphs = container.querySelectorAll('.entry-paragraph');
    expect(paragraphs).toHaveLength(2);

    // Check the second paragraph (trailing tag section)
    const tagSection = paragraphs[1];
    const tagLinks = tagSection.querySelectorAll('.tag-link');

    // Assert exactly two tag buttons
    expect(tagLinks).toHaveLength(2);

    // Assert the tag button text content
    expect(tagLinks[0].textContent).toBe('#health');
    expect(tagLinks[1].textContent).toBe('#outdoors');

    // Assert no stray text in the section (only tags and whitespace)
    // Get all text nodes and filter out whitespace
    const walker = document.createTreeWalker(
      tagSection,
      NodeFilter.SHOW_TEXT,
      null
    );
    let textNode;
    const textContent: string[] = [];
    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent?.trim();
      if (text && text.length > 0) {
        textContent.push(text);
      }
    }

    // Should only contain the tag text content
    expect(textContent).toEqual(['#health', '#outdoors']);
  });
});
