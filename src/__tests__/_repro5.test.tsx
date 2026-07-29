import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB } from '../lib/db';

describe('tag filter real flow repro with blank line', () => {
  beforeEach(async () => {
    const db = await getDB();
    const tx = db.transaction('entries', 'readwrite');
    const allKeys = await tx.store.getAllKeys();
    for (const key of allKeys) await tx.store.delete(key);
    await tx.done;
  });

  it('typing sections separated by a blank line then filtering by tag', async () => {
    render(<App />);
    const textarea = await screen.findByPlaceholderText(/Write a note/) as HTMLTextAreaElement;
    await userEvent.click(textarea);
    await userEvent.type(textarea, 'Went for a walk #exercise{Enter}{Enter}Ate lunch #food{Enter}{Enter}Called mom #family');
    console.log('COMPOSER VALUE:', JSON.stringify(textarea.value));
    await userEvent.tab();

    await waitFor(() => {
      expect(document.querySelector('.tag-item')).toBeInTheDocument();
    });

    const db = await getDB();
    const all = await db.getAll('entries');
    console.log('STORED ENTRY TEXT:', JSON.stringify(all[0]?.text));

    const rightRailTagButton = Array.from(document.querySelectorAll('.tag-item')).find(b => b.textContent?.includes('#exercise'))!;
    await userEvent.click(rightRailTagButton);

    await waitFor(() => {
      const html = document.querySelector('.entry-list')?.innerHTML || '';
      console.log('MATCHES FOOD?', html.includes('#food'), 'MATCHES FAMILY?', html.includes('#family'), 'MATCHES EXERCISE?', html.includes('#exercise'));
    });
  });
});
