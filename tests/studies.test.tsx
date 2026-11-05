// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Studies } from '@/components/studies';
import {
  resolveStudyLink,
  safeStudyUrl,
  type StudyCollection,
  type StudyNote,
} from '@/lib/studies';
import { schemas } from '@/lib/schemas';
const mocks = vi.hoisted(() => ({ app: {} as Record<string, unknown>, query: '' }));
vi.mock('@/components/app-provider', () => ({ useApp: () => mocks.app }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock('@/components/attachments', () => ({
  Attachments: ({ entity, id }: { entity: string; id: string }) => (
    <div data-testid="attachments">
      {entity}:{id}
    </div>
  ),
}));
const book: StudyCollection = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'book',
  title: 'Leituras',
  author: 'Autora',
  description: '',
  status: 'in_progress',
};
const subject: StudyCollection = {
  ...book,
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'subject',
  title: 'Física',
};
const note: StudyNote = {
  id: '33333333-3333-4333-8333-333333333333',
  collection_id: book.id,
  title: 'Conceito',
  content: '# Resumo\n\nUma ideia **importante**.',
  source_url: '',
  tags: ['revisar'],
};
const linked: StudyNote = {
  ...note,
  id: '44444444-4444-4444-8444-444444444444',
  collection_id: subject.id,
  title: 'Aplicação',
  content: `Veja [[${note.id}|Conceito]].`,
};
beforeEach(() => {
  mocks.query = '';
  mocks.app = {
    data: { study_collections: [book, subject], study_notes: [note, linked], attachments: [] },
    save: vi.fn().mockImplementation(async (_entity, value) => ({
      ...value,
      id: value.id ?? '55555555-5555-4555-8555-555555555555',
    })),
    notify: vi.fn(),
  };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Study workspace', () => {
  it('creates a subject with the real entity schema', async () => {
    render(<Studies />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova matéria' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Matemática' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(mocks.app.save).toHaveBeenCalledWith(
        'study_collections',
        expect.objectContaining({ kind: 'subject', title: 'Matemática', status: 'in_progress' }),
        'POST',
      ),
    );
  });
  it('saves Markdown, tags and a reference inside the chosen collection', async () => {
    render(<Studies />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    fireEvent.change(screen.getByLabelText('Título da nota'), { target: { value: 'Capítulo 2' } });
    fireEvent.change(screen.getByLabelText('Conteúdo'), {
      target: { value: '# Resumo\n\n[[Conceito]]' },
    });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'livro, revisão' } });
    fireEvent.change(screen.getByLabelText('Link de referência'), {
      target: { value: 'https://example.com/reference' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() =>
      expect(mocks.app.save).toHaveBeenCalledWith(
        'study_notes',
        expect.objectContaining({
          collection_id: book.id,
          title: 'Capítulo 2',
          content: '# Resumo\n\n[[Conceito]]',
          tags: ['livro', 'revisão'],
          source_url: 'https://example.com/reference',
        }),
        'POST',
      ),
    );
  });
  it('renders Markdown, backlinks and note files without loading external images or HTML', async () => {
    mocks.query = `note=${note.id}`;
    mocks.app.data = {
      study_collections: [book, subject],
      study_notes: [
        {
          ...note,
          content:
            note.content +
            '\n<script>alert(1)</script>\n\n![tracker](https://example.com/image.png)\n\n[unsafe](javascript:alert(1))',
        },
        linked,
      ],
      attachments: [],
    };
    const view = render(<Studies />);
    expect(screen.getByRole('heading', { name: 'Resumo' })).toBeTruthy();
    expect(view.container.querySelector('strong')?.textContent).toBeTruthy();
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('a[href^="javascript:"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Aplicação.*Física/ }));
    const link = screen.getByRole('link', { name: 'Conceito' });
    expect(link.getAttribute('href')).toBe(`/estudos?note=${note.id}`);
    fireEvent.click(link);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivos da nota (0)' }));
    expect(screen.getByTestId('attachments').textContent).toBe(`study_notes:${note.id}`);
  });
  it('keeps the draft after a failed save and refuses navigation when discard is cancelled', async () => {
    mocks.query = `note=${note.id}`;
    mocks.app.save = vi.fn().mockRejectedValue(Error('offline'));
    render(<Studies />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Conteúdo'), {
      target: { value: 'Rascunho importante' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Conteúdo') as HTMLTextAreaElement).value).toBe(
      'Rascunho importante',
    );
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /Física.*1 notas/ }));
    expect((screen.getByLabelText('Conteúdo') as HTMLTextAreaElement).value).toBe(
      'Rascunho importante',
    );
  });
  it('opens another search result without reloading the study workspace', async () => {
    mocks.query = `note=${note.id}`;
    const view = render(<Studies />);
    expect(screen.getByRole('heading', { name: 'Conceito' })).toBeTruthy();
    mocks.query = `note=${linked.id}`;
    view.rerender(<Studies />);
    await screen.findByRole('heading', { name: 'Aplicação' });
  });
  it('preserves a draft when changing search results is cancelled', () => {
    mocks.query = `note=${note.id}`;
    const view = render(<Studies />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Conteúdo'), {
      target: { value: 'Rascunho protegido' },
    });
    vi.mocked(window.confirm).mockReturnValue(false);
    mocks.query = `note=${linked.id}`;
    view.rerender(<Studies />);
    expect((screen.getByLabelText('Conteúdo') as HTMLTextAreaElement).value).toBe(
      'Rascunho protegido',
    );
    expect(window.confirm).toHaveBeenCalled();
  });
  it('resolves stable IDs after renaming and avoids ambiguous cross-collection titles', () => {
    expect(resolveStudyLink(note.id, [{ ...note, title: 'Renomeado' }], [book], book.id)?.id).toBe(
      note.id,
    );
    expect(resolveStudyLink('Física/Aplicação', [note, linked], [book, subject], book.id)?.id).toBe(
      linked.id,
    );
    expect(
      resolveStudyLink(
        'Conceito',
        [note, { ...linked, title: 'Conceito' }],
        [book, subject],
        'unrelated',
      ),
    ).toBeUndefined();
    expect(safeStudyUrl('javascript:alert(1)')).toBeUndefined();
    expect(
      schemas.study_notes.safeParse({ ...note, source_url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
});
