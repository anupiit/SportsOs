import { Logger } from '@nestjs/common';
import { Pinecone } from '@pinecone-database/pinecone';

export interface KnowledgeDoc {
  id: string;
  title: string;
  kind: string;
  text: string;
}

export interface SearchHit extends KnowledgeDoc {
  score: number;
}

export interface VectorStore {
  readonly name: 'pinecone' | 'local';
  /** Replaces the whole corpus. */
  replaceAll(docs: KnowledgeDoc[]): Promise<void>;
  search(query: string, topK: number): Promise<SearchHit[]>;
  count(): number;
}

// ------------------------------------------------------------------ local fallback

const STOP = new Set('a an and are as at be by for from has have how i in is it its of on or that the this to was were what when where which who will with any do does can my me we our you your'.split(' '));

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/**
 * In-process Okapi BM25 index, used when no Pinecone key is configured so the
 * assistant still retrieves grounded context offline.
 */
export class LocalBm25Store implements VectorStore {
  readonly name = 'local' as const;
  private docs: (KnowledgeDoc & { tf: Map<string, number>; len: number })[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;

  async replaceAll(docs: KnowledgeDoc[]) {
    this.df.clear();
    this.docs = docs.map((d) => {
      const tokens = tokenize(`${d.title} ${d.title} ${d.text}`);
      const tf = new Map<string, number>();
      tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
      tf.forEach((_, t) => this.df.set(t, (this.df.get(t) ?? 0) + 1));
      return { ...d, tf, len: tokens.length };
    });
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length);
  }

  async search(query: string, topK: number): Promise<SearchHit[]> {
    const k1 = 1.2;
    const b = 0.75;
    const n = this.docs.length;
    const terms = [...new Set(tokenize(query))];
    return this.docs
      .map((d) => {
        let score = 0;
        for (const t of terms) {
          const f = d.tf.get(t);
          if (!f) continue;
          const df = this.df.get(t) ?? 0;
          const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
          score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen));
        }
        return { id: d.id, title: d.title, kind: d.kind, text: d.text, score };
      })
      .filter((h) => h.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, topK);
  }

  count() {
    return this.docs.length;
  }
}

// ------------------------------------------------------------------ Pinecone

/**
 * Pinecone index with integrated embedding (the index embeds `chunk_text`
 * itself), so no separate embedding provider is needed. The index is created
 * on first use if it doesn't exist.
 */
export class PineconeStore implements VectorStore {
  readonly name = 'pinecone' as const;
  private readonly logger = new Logger(PineconeStore.name);
  private readonly pc: Pinecone;
  private ready: Promise<void> | null = null;
  private size = 0;

  constructor(
    apiKey: string,
    private readonly indexName: string,
    private readonly namespace: string,
  ) {
    this.pc = new Pinecone({ apiKey });
  }

  private index() {
    return this.pc.index({ name: this.indexName, namespace: this.namespace });
  }

  private ensureIndex() {
    this.ready ??= this.pc.indexes
      .createForModel({
        name: this.indexName,
        cloud: 'aws',
        region: 'us-east-1',
        embed: { model: 'llama-text-embed-v2', fieldMap: { text: 'chunk_text' } },
        waitUntilReady: true,
        suppressConflicts: true,
      })
      .then(() => undefined)
      .catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }

  async replaceAll(docs: KnowledgeDoc[]) {
    await this.ensureIndex();
    const index = this.index();
    try {
      await index.deleteAll();
    } catch (e) {
      // a namespace that doesn't exist yet can't be cleared; anything else is real
      this.logger.debug(`deleteAll skipped: ${(e as Error).message}`);
    }
    for (let i = 0; i < docs.length; i += 90) {
      await index.upsertRecords({
        records: docs.slice(i, i + 90).map((d) => ({ _id: d.id, chunk_text: `${d.title}\n${d.text}`, title: d.title, kind: d.kind })),
      });
    }
    this.size = docs.length;
  }

  async search(query: string, topK: number): Promise<SearchHit[]> {
    await this.ensureIndex();
    const res = await this.index().searchRecords({ query: { topK, inputs: { text: query } }, fields: ['chunk_text', 'title', 'kind'] });
    return res.result.hits.map((h) => {
      const f = h.fields as { chunk_text?: string; title?: string; kind?: string };
      return { id: h._id, title: f.title ?? h._id, kind: f.kind ?? 'doc', text: f.chunk_text ?? '', score: h._score };
    });
  }

  count() {
    return this.size;
  }
}
