import type { Row } from './domain';
export type StudyCollection = Row & {
  kind: 'book' | 'subject';
  title: string;
  author: string;
  description: string;
  status: 'planned' | 'in_progress' | 'completed';
};
export type StudyNote = Row & {
  collection_id: string;
  title: string;
  content: string;
  source_url: string;
  tags: string[];
};
export const studyStatus = {
  planned: 'Planejado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
};
const normalize = (value: string) => value.trim().toLocaleLowerCase('pt-BR');
export function resolveStudyLink(
  target: string,
  notes: StudyNote[],
  collections: StudyCollection[],
  collectionId: string,
): StudyNote | undefined {
  const key = normalize(target.split('|')[0]);
  const exact = notes.find((n) => n.id === key);
  if (exact) return exact;
  const qualified = notes.filter(
    (n) =>
      normalize(`${collections.find((c) => c.id === n.collection_id)?.title}/${n.title}`) === key,
  );
  if (qualified.length === 1) return qualified[0];
  const matches = notes.filter((n) => normalize(n.title) === key);
  return (
    matches.find((n) => n.collection_id === collectionId) ??
    (matches.length === 1 ? matches[0] : undefined)
  );
}
export function studyReferences(content: string): string[] {
  const prose = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`]*`/g, '');
  return Array.from(prose.matchAll(/\[\[([^\]\n]+)\]\]/g), (m) => m[1]);
}
// Transform only Markdown text nodes. Code blocks, inline code and existing links stay intact.
type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };
export function remarkStudyLinks(options: {
  notes: StudyNote[];
  collections: StudyCollection[];
  collectionId: string;
}) {
  return (tree: MarkdownNode) => {
    function walk(node: MarkdownNode) {
      if (!node.children || ['link', 'linkReference'].includes(node.type)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child);
          return [child];
        }
        const result: MarkdownNode[] = [];
        let offset = 0;
        for (const match of child.value.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
          const note = resolveStudyLink(
            match[1],
            options.notes,
            options.collections,
            options.collectionId,
          );
          if (!note) continue;
          result.push({ type: 'text', value: child.value.slice(offset, match.index) });
          result.push({
            type: 'link',
            url: `/estudos?note=${note.id}`,
            children: [
              { type: 'text', value: match[1].split('|').slice(1).join('|') || note.title },
            ],
          });
          offset = match.index! + match[0].length;
        }
        result.push({ type: 'text', value: child.value.slice(offset) });
        return result;
      });
    }
    walk(tree);
  };
}
export function safeStudyUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
