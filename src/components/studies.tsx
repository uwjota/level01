'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  GraduationCap,
  Plus,
  Search,
  FileText,
  Pencil,
  Trash2,
  Paperclip,
  ExternalLink,
  Link2,
  ArrowLeft,
  Save,
} from 'lucide-react';
import { useApp } from './app-provider';
import { PageHeading, Empty } from './dashboard';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Attachments } from './attachments';
import { schemas } from '@/lib/schemas';
import {
  remarkStudyLinks,
  resolveStudyLink,
  safeStudyUrl,
  studyReferences,
  studyStatus,
  type StudyCollection,
  type StudyNote,
} from '@/lib/studies';

export function Studies() {
  const { data, save, notify } = useApp();
  const collections = (data.study_collections ?? []) as StudyCollection[];
  const notes = (data.study_notes ?? []) as StudyNote[];
  const params = useSearchParams();
  const initialNote = notes.find((n) => n.id === params.get('note'));
  const [collectionId, setCollectionId] = useState(
    initialNote?.collection_id ?? params.get('collection') ?? collections[0]?.id ?? '',
  );
  const [noteId, setNoteId] = useState(initialNote?.id ?? '');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [collectionEditor, setCollectionEditor] = useState<{
    kind: 'book' | 'subject';
    record?: StudyCollection;
  } | null>(null);
  const [files, setFiles] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestedNote = params.get('note'),
    requestedCollection = params.get('collection');
  const lastTarget = useRef(`${requestedNote ?? ''}:${requestedCollection ?? ''}`);
  useEffect(() => {
    const target = `${requestedNote ?? ''}:${requestedCollection ?? ''}`;
    if (target === lastTarget.current) return;
    lastTarget.current = target;
    const note = notes.find((item) => item.id === requestedNote);
    const nextCollection = note?.collection_id ?? requestedCollection;
    const nextNote = note?.id ?? '';
    if (!nextCollection || (nextCollection === collectionId && nextNote === noteId)) return;
    if (dirty && !confirm('Há alterações não salvas. Descartar e continuar?')) {
      history.replaceState(
        null,
        '',
        noteId ? `/estudos?note=${noteId}` : `/estudos?collection=${collectionId}`,
      );
      return;
    }
    setDirty(false);
    setCollectionId(nextCollection);
    setNoteId(nextNote);
    setQuery('');
  }, [requestedNote, requestedCollection, notes, collectionId, noteId, dirty]);
  const collection = collections.find((c) => c.id === collectionId);
  const selected = notes.find((n) => n.id === noteId);
  const search = query.trim().toLocaleLowerCase('pt-BR');
  const visibleNotes = notes.filter(
    (n) =>
      n.collection_id === collectionId &&
      `${n.title} ${n.content} ${n.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(search),
  );
  const visibleCollections = collections.filter((c) => kind === 'all' || c.kind === kind);
  function leave() {
    return !dirty || confirm('Há alterações não salvas. Descartar e continuar?');
  }
  function chooseCollection(id: string) {
    if (!leave()) return;
    setDirty(false);
    setCollectionId(id);
    setNoteId('');
    setQuery('');
    history.replaceState(null, '', `/estudos?collection=${id}`);
  }
  function chooseNote(id: string) {
    if (!leave()) return;
    const note = notes.find((n) => n.id === id);
    if (note) {
      setCollectionId(note.collection_id);
      setNoteId(id);
      setDirty(false);
      history.replaceState(null, '', `/estudos?note=${id}`);
    }
  }
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const navigate = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest?.('a[href]');
      if (
        !anchor ||
        anchor.getAttribute('target') === '_blank' ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      )
        return;
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#') || href.startsWith('/estudos?note=')) return;
      if (!confirm('Há alterações não salvas. Descartar e sair?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty]);
  async function deleteCollection() {
    if (!collection || !leave()) return;
    if (notes.some((n) => n.collection_id === collection.id)) {
      notify('Exclua ou mova as notas antes de excluir esta coleção.');
      return;
    }
    if (!confirm(`Excluir “${collection.title}”?`)) return;
    setBusy(true);
    try {
      await save('study_collections', { id: collection.id }, 'DELETE');
      setCollectionId('');
      setNoteId('');
      notify('Coleção excluída.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Estudos"
        action={
          <div className="flex study-create">
            <Button variant="outline" onClick={() => setCollectionEditor({ kind: 'subject' })}>
              <GraduationCap size={17} /> Nova matéria
            </Button>
            <Button onClick={() => setCollectionEditor({ kind: 'book' })}>
              <BookOpen size={17} /> Novo livro
            </Button>
          </div>
        }
      />
      <div className="studies-workspace">
        <aside className="panel study-library" aria-label="Biblioteca de estudos">
          <div className="study-library-title">
            <h2>Biblioteca</h2>
            <span className="count">{collections.length}</span>
          </div>
          <div className="study-kinds" aria-label="Filtrar coleções">
            {[
              ['all', 'Tudo'],
              ['book', 'Livros'],
              ['subject', 'Matérias'],
            ].map(([id, label]) => (
              <button key={id} aria-pressed={kind === id} onClick={() => setKind(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="study-collections">
            {visibleCollections.map((c) => (
              <button
                key={c.id}
                className={`study-collection ${c.id === collectionId ? 'selected' : ''}`}
                onClick={() => chooseCollection(c.id)}
                aria-pressed={c.id === collectionId}
                aria-label={`${c.title}, ${notes.filter((n) => n.collection_id === c.id).length} notas`}
              >
                {c.kind === 'book' ? <BookOpen size={18} /> : <GraduationCap size={18} />}
                <span>
                  <strong>{c.title}</strong>
                  <small>{notes.filter((n) => n.collection_id === c.id).length} notas</small>
                </span>
              </button>
            ))}
            {!visibleCollections.length && (
              <p className="study-small-empty">
                {kind === 'book'
                  ? 'Nenhum livro.'
                  : kind === 'subject'
                    ? 'Nenhuma matéria.'
                    : 'Sua biblioteca está vazia.'}
              </p>
            )}
          </div>
        </aside>
        <section className="panel study-main">
          {collection ? (
            <>
              <header className="study-collection-header">
                <div>
                  <span className="study-kind-label">
                    {collection.kind === 'book' ? 'LIVRO' : 'MATÉRIA'}
                  </span>
                  <h2>{collection.title}</h2>
                  {collection.author && <p>{collection.author}</p>}
                  <span
                    className={`badge ${collection.status === 'planned' ? 'warning-badge' : ''}`}
                  >
                    {studyStatus[collection.status]}
                  </span>
                  {collection.description && <p>{collection.description}</p>}
                </div>
                <div className="flex">
                  <button
                    className="icon-button"
                    aria-label="Editar coleção"
                    onClick={() =>
                      setCollectionEditor({ kind: collection.kind, record: collection })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Excluir coleção"
                    disabled={busy}
                    onClick={() => void deleteCollection()}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </header>
              <div className="study-panes">
                <aside className="study-note-list" aria-label="Notas da coleção">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (leave()) {
                        setNoteId('new');
                        setDirty(false);
                      }
                    }}
                  >
                    <Plus size={16} /> Nova nota
                  </Button>
                  <label className="study-search">
                    <Search size={15} />
                    <span className="sr-only">Buscar nas notas</span>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar notas…"
                    />
                  </label>
                  <div className="study-note-items">
                    {visibleNotes.map((n) => (
                      <button
                        key={n.id}
                        className={`study-note-item ${n.id === noteId ? 'selected' : ''}`}
                        onClick={() => chooseNote(n.id)}
                        aria-pressed={n.id === noteId}
                      >
                        <FileText size={16} />
                        <span>
                          <strong>{n.title}</strong>
                          <small>{n.tags.length ? n.tags.join(' · ') : 'Nota'}</small>
                        </span>
                      </button>
                    ))}
                    {!visibleNotes.length && (
                      <p className="study-small-empty">
                        {query ? 'Nenhuma nota encontrada.' : 'Adicione sua primeira nota.'}
                      </p>
                    )}
                  </div>
                </aside>
                {selected || noteId === 'new' ? (
                  <StudyEditor
                    key={selected?.id ?? `new-${collectionId}`}
                    note={selected}
                    collection={collection}
                    notes={notes}
                    collections={collections}
                    onDirty={setDirty}
                    onOpenNote={chooseNote}
                    onFiles={setFiles}
                    onSaved={(note) => {
                      setDirty(false);
                      setNoteId(note.id);
                      setCollectionId(note.collection_id);
                      history.replaceState(null, '', `/estudos?note=${note.id}`);
                    }}
                    onDeleted={() => {
                      setDirty(false);
                      setNoteId('');
                      history.replaceState(null, '', `/estudos?collection=${collectionId}`);
                    }}
                  />
                ) : (
                  <div className="study-idle">
                    <FileText size={32} />
                    <h3>Selecione uma nota</h3>
                    <p>Escreva, conecte ideias e reúna referências.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Empty
              title={collections.length ? 'Selecione uma coleção' : 'Sua biblioteca de estudos'}
              description="Organize livros e matérias com notas, links e arquivos."
              action={
                <Button onClick={() => setCollectionEditor({ kind: 'book' })}>
                  <Plus size={16} /> Adicionar livro
                </Button>
              }
            />
          )}
        </section>
      </div>
      {collectionEditor && (
        <CollectionEditor
          kind={collectionEditor.kind}
          record={collectionEditor.record}
          onClose={() => setCollectionEditor(null)}
          onSaved={(row) => {
            setCollectionEditor(null);
            if (!dirty) {
              setCollectionId(row.id);
              setNoteId('');
              setKind('all');
            }
          }}
        />
      )}
      {files && <Attachments entity="study_notes" id={files} onClose={() => setFiles(null)} />}
    </>
  );
}

function CollectionEditor({
  kind,
  record,
  onClose,
  onSaved,
}: {
  kind: 'book' | 'subject';
  record?: StudyCollection;
  onClose: () => void;
  onSaved: (row: StudyCollection) => void;
}) {
  const { save } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`${record ? 'Editar' : kind === 'book' ? 'Novo' : 'Nova'} ${kind === 'book' ? 'livro' : 'matéria'}`}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const value = schemas.study_collections.parse({
              kind,
              title: f.get('title'),
              author: f.get('author') ?? '',
              description: f.get('description'),
              status: f.get('status'),
            });
            const row = await save(
              'study_collections',
              { ...value, ...(record ? { id: record.id } : {}) },
              record ? 'PATCH' : 'POST',
            );
            onSaved(row as StudyCollection);
          } catch {
            setError('Não foi possível salvar. Confira os campos e tente novamente.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="study-fieldset">
          <label>
            Título
            <input
              name="title"
              required
              maxLength={300}
              defaultValue={record?.title ?? ''}
              autoFocus
            />
          </label>
          {kind === 'book' && (
            <label>
              Autor
              <input name="author" maxLength={300} defaultValue={record?.author ?? ''} />
            </label>
          )}
          <label>
            Status
            <select name="status" defaultValue={record?.status ?? 'in_progress'}>
              {Object.entries(studyStatus).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descrição
            <textarea
              name="description"
              rows={3}
              maxLength={20000}
              defaultValue={record?.description ?? ''}
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">{busy ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function StudyEditor({
  note,
  collection,
  notes,
  collections,
  onDirty,
  onSaved,
  onDeleted,
  onOpenNote,
  onFiles,
}: {
  note?: StudyNote;
  collection: StudyCollection;
  notes: StudyNote[];
  collections: StudyCollection[];
  onDirty: (value: boolean) => void;
  onSaved: (note: StudyNote) => void;
  onDeleted: () => void;
  onOpenNote: (id: string) => void;
  onFiles: (id: string) => void;
}) {
  const { save, data } = useApp();
  const [draft, setDraft] = useState({
    title: note?.title ?? '',
    content: note?.content ?? '',
    source_url: note?.source_url ?? '',
    tags: note?.tags.join(', ') ?? '',
    collection_id: note?.collection_id ?? collection.id,
  });
  const [baseline, setBaseline] = useState(JSON.stringify(draft));
  const [mode, setMode] = useState<'edit' | 'read'>(note ? 'read' : 'edit');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const patch = (key: keyof typeof draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const attachmentCount = (data.attachments ?? []).filter(
    (a) => a.entity_type === 'study_notes' && a.entity_id === note?.id,
  ).length;
  const backlinks = note
    ? notes.filter(
        (n) =>
          n.id !== note.id &&
          studyReferences(n.content).some(
            (ref) => resolveStudyLink(ref, notes, collections, n.collection_id)?.id === note.id,
          ),
      )
    : [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const value = schemas.study_notes.parse({
        ...draft,
        tags: draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      const row = await save(
        'study_notes',
        { ...value, ...(note ? { id: note.id } : {}) },
        note ? 'PATCH' : 'POST',
      );
      setBaseline(JSON.stringify(draft));
      setSaved(true);
      onDirty(false);
      onSaved(row as StudyNote);
    } catch {
      setError(
        'Não foi possível salvar. Use um título único nesta coleção, até 30 tags e um link http(s) válido.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteNote() {
    if (!note) return;
    if (attachmentCount) {
      setError('Remova os arquivos anexados antes de excluir a nota.');
      return;
    }
    if (!confirm('Excluir esta nota permanentemente?')) return;
    setBusy(true);
    setError('');
    try {
      await save('study_notes', { id: note.id }, 'DELETE');
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="study-editor" onSubmit={submit}>
      <fieldset disabled={busy} className="study-fieldset">
        <div className="study-editor-toolbar">
          <div className="segmented">
            <button
              type="button"
              aria-pressed={mode === 'edit'}
              className={mode === 'edit' ? 'active' : ''}
              onClick={() => setMode('edit')}
            >
              Editar
            </button>
            <button
              type="button"
              aria-pressed={mode === 'read'}
              className={mode === 'read' ? 'active' : ''}
              onClick={() => setMode('read')}
            >
              Leitura
            </button>
          </div>
          <div className="flex">
            {note && (
              <>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Arquivos da nota (${attachmentCount})`}
                  onClick={() => onFiles(note.id)}
                >
                  <Paperclip size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Excluir nota"
                  onClick={() => void deleteNote()}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <Button type="submit" disabled={busy || (!!note && !dirty)}>
              <Save size={15} />
              {busy ? 'Salvando…' : 'Salvar nota'}
            </Button>
          </div>
        </div>
        <div className="study-save-state" role="status">
          {dirty ? 'Alterações não salvas' : saved ? 'Salvo' : note ? 'Salvo' : 'Nova nota'}
        </div>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {mode === 'edit' ? (
          <>
            <label>
              Título da nota
              <input
                value={draft.title}
                onChange={(e) => patch('title', e.target.value)}
                required
                maxLength={300}
                placeholder="Título"
              />
            </label>
            <label>
              Conteúdo
              <textarea
                className="study-content-input"
                value={draft.content}
                onChange={(e) => patch('content', e.target.value)}
                maxLength={20000}
                rows={15}
                placeholder={
                  '# Ideias principais\n\nEscreva em Markdown e conecte notas com [[título]].'
                }
              />
            </label>
            <div className="study-link-insert">
              <Link2 size={16} />
              <select
                aria-label="Vincular outra nota"
                value=""
                onChange={(e) => {
                  const target = notes.find((n) => n.id === e.target.value);
                  if (target)
                    patch(
                      'content',
                      `${draft.content}${draft.content ? '\n' : ''}[[${target.id}|${target.title.replace(/[\[\]|\n]/g, ' ')}]]`,
                    );
                }}
              >
                <option value="">Vincular outra nota…</option>
                {notes
                  .filter((n) => n.id !== note?.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {collections.find((c) => c.id === n.collection_id)?.title} / {n.title}
                    </option>
                  ))}
              </select>
            </div>
            <p className="small muted study-editor-help">
              Use [[título]] ou [[coleção/título]]. O seletor mantém o vínculo mesmo após renomear a
              nota.
            </p>
            <div className="form-grid">
              <label>
                Coleção
                <select
                  value={draft.collection_id}
                  onChange={(e) => patch('collection_id', e.target.value)}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tags
                <input
                  value={draft.tags}
                  onChange={(e) => patch('tags', e.target.value)}
                  placeholder="Separe por vírgulas"
                />
              </label>
            </div>
            <label>
              Link de referência
              <input
                type="url"
                value={draft.source_url}
                onChange={(e) => patch('source_url', e.target.value)}
                maxLength={2000}
                placeholder="https://…"
              />
            </label>
          </>
        ) : (
          <>
            <h2 className="study-note-title">{draft.title || 'Sem título'}</h2>
            <div className="study-tags">
              {draft.tags
                .split(',')
                .filter((t) => t.trim())
                .map((t, i) => (
                  <span className="badge" key={i}>
                    {t.trim()}
                  </span>
                ))}
            </div>
            {safeStudyUrl(draft.source_url) && (
              <a
                className="study-reference"
                href={safeStudyUrl(draft.source_url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} /> Abrir referência
              </a>
            )}
            <div className="study-markdown">
              <Markdown
                skipHtml
                remarkPlugins={[
                  remarkGfm,
                  [remarkStudyLinks, { notes, collections, collectionId: draft.collection_id }],
                ]}
                components={{
                  a: ({ href, children }) =>
                    href?.startsWith('/estudos?note=') ? (
                      <a
                        href={href}
                        onClick={(e) => {
                          e.preventDefault();
                          onOpenNote(href.split('=')[1]);
                        }}
                      >
                        {children}
                      </a>
                    ) : safeStudyUrl(href ?? '') ? (
                      <a href={safeStudyUrl(href!)} target="_blank" rel="noopener noreferrer">
                        {children}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span>{children}</span>
                    ),
                  img: ({ alt, src }) => (
                    <span>
                      [Imagem: {alt || 'sem descrição'}]
                      {typeof src === 'string' && safeStudyUrl(src) && (
                        <a href={safeStudyUrl(src)} target="_blank" rel="noopener noreferrer">
                          {' '}
                          abrir
                        </a>
                      )}
                    </span>
                  ),
                }}
              >
                {draft.content || '*Nenhum conteúdo ainda.*'}
              </Markdown>
            </div>
          </>
        )}
        {note && (
          <div className="study-related">
            <div className="study-related-heading">
              <h3>
                <Link2 size={15} /> Referências a esta nota
              </h3>
              <button type="button" className="text-link" onClick={() => onFiles(note.id)}>
                <Paperclip size={14} /> Arquivos ({attachmentCount})
              </button>
            </div>
            {backlinks.length ? (
              backlinks.map((n) => (
                <button
                  type="button"
                  className="study-backlink"
                  aria-label={`${n.title}, ${collections.find((c) => c.id === n.collection_id)?.title}`}
                  key={n.id}
                  onClick={() => onOpenNote(n.id)}
                >
                  <ArrowLeft size={14} />
                  <span>
                    {n.title}
                    <small>{collections.find((c) => c.id === n.collection_id)?.title}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="small muted">Nenhuma nota vinculada ainda.</p>
            )}
          </div>
        )}
        {!note && <p className="small muted">Salve a nota para anexar arquivos.</p>}
      </fieldset>
    </form>
  );
}
