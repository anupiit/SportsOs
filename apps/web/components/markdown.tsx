import type { ReactNode } from 'react';

/**
 * Minimal, safe Markdown renderer for AI answers and reports. It builds React
 * elements directly (never injects HTML), so model output can't smuggle markup.
 * Supports headings, paragraphs, bold/italic/code, links, lists, quotes, rules,
 * fenced code and GitHub-style tables.
 */

type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'hr' }
  | { type: 'table'; header: string[]; rows: string[][] };

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      blocks.push({ type: 'h', level: h[1].length, text: h[2].replace(/\s*#+\s*$/, '') });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }
    if (trimmed.startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      i--;
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].trim().replace(/^[-*+]\s+/, ''));
      i--;
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].trim().replace(/^\d+[.)]\s+/, ''));
      i--;
      blocks.push({ type: 'ol', items });
      continue;
    }
    if (trimmed.startsWith('>')) {
      flush();
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) body.push(lines[i++].trim().replace(/^>\s?/, ''));
      i--;
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(\b_[^_\s][^_]*_\b)/;

function safeHref(href: string): string | null {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return null;
}

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = lm ? safeHref(lm[2]) : null;
      if (lm && href) {
        out.push(
          <a key={k} href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">
            {lm[1]}
          </a>,
        );
      } else out.push(lm ? lm[1] : tok);
    } else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parse(source);
  return (
    <div className={`prose-sm text-sm text-text ${className ?? ''}`}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case 'h': {
            const content = inline(b.text, k);
            if (b.level === 1) return <h1 key={k}>{content}</h1>;
            if (b.level === 2) return <h2 key={k}>{content}</h2>;
            if (b.level === 3) return <h3 key={k}>{content}</h3>;
            return <h4 key={k}>{content}</h4>;
          }
          case 'p':
            return <p key={k}>{inline(b.text, k)}</p>;
          case 'ul':
            return (
              <ul key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return <blockquote key={k}>{inline(b.text, k)}</blockquote>;
          case 'code':
            return (
              <pre key={k}>
                <code>{b.text}</code>
              </pre>
            );
          case 'hr':
            return <hr key={k} />;
          case 'table':
            return (
              <div key={k} className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      {b.header.map((c, j) => (
                        <th key={j}>{inline(c, `${k}-h${j}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, j) => (
                          <td key={j}>{inline(c, `${k}-${ri}-${j}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

/** Strip Markdown for speech synthesis. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
