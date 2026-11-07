import type { TextChunk } from '../types';
import { endsWithAbbreviation, hasSpeakableContent, prepareSpeech } from './spoken';

/** Versão da extração e preparo do texto; livros com versão menor são reprocessados. */
export const TEXT_VERSION = 2;

const LIGATURES: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};

/**
 * Normaliza o texto extraído do PDF sem destruir a estrutura de parágrafos.
 * Também corrige ligaduras tipográficas que atrapalham a síntese de voz.
 */
export function normalizeExtractedText(input: string): string {
  let text = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00AD|\u200B|\u200C|\u200D|\uFEFF/g, '')
    .replace(/\u00A0/g, ' ');

  text = Array.from(text)
    .map((char) => LIGATURES[char] ?? char)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 9 || code === 10) return true;
      if (code < 32) return false;
      if (code >= 127 && code <= 159) return false;
      return true;
    })
    .join('');

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Texto que a voz vai falar: sem números de nota e de parágrafo, com
 * referências bíblicas, abreviações, romanos e ordinais por extenso.
 */
export function toSpeechText(raw: string): string {
  return prepareSpeech(raw);
}

const MAX_CHUNK_LENGTH = 240;
const MIN_BREAK_RATIO = 0.5;

/**
 * Divide o texto em blocos curtos, com offsets no texto original.
 * Blocos curtos evitam falhas e cortes da Web Speech API em textos longos.
 */
export function splitIntoChunks(raw: string, maxLength = MAX_CHUNK_LENGTH): TextChunk[] {
  const chunks: TextChunk[] = [];
  const length = raw.length;
  const safeMax = Math.max(40, maxLength);
  let cursor = 0;

  const push = (start: number, end: number) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(raw[s])) s += 1;
    while (e > s && /\s/.test(raw[e - 1])) e -= 1;
    if (e <= s) return;
    const text = raw.slice(s, e);
    if (!hasSpeakableContent(toSpeechText(text))) return;
    chunks.push({ text, start: s, end: e });
  };

  while (cursor < length) {
    while (cursor < length && /\s/.test(raw[cursor])) cursor += 1;
    if (cursor >= length) break;

    const start = cursor;
    const hardLimit = Math.min(length, start + safeMax);
    let end = hardLimit;

    if (hardLimit < length) {
      const windowStart = start + Math.floor(safeMax * MIN_BREAK_RATIO);
      let sentenceBreak = -1;
      let clauseBreak = -1;
      let spaceBreak = -1;

      for (let i = hardLimit; i > windowStart; i -= 1) {
        const previous = raw[i - 1];
        const next = raw[i];
        if (
          /[.!?…]/.test(previous) &&
          (next === undefined || /[\s"”’)\]]/.test(next)) &&
          !(previous === '.' && endsWithAbbreviation(raw.slice(Math.max(start, i - 12), i - 1))) &&
          // "19." no começo da linha é número de parágrafo, não fim de frase.
          !/(?:^|\n)[ \t]*\d{1,3}\.$/.test(raw.slice(Math.max(0, i - 8), i)) &&
          // Reticências entre colchetes ou parênteses: "[...]".
          !(/[[(]\.*$/.test(raw.slice(Math.max(0, i - 4), i - 1)) && /[\])]/.test(next ?? ''))
        ) {
          sentenceBreak = i;
          break;
        }
        if (clauseBreak < 0 && /[;:,]/.test(previous) && next !== undefined && /\s/.test(next)) {
          clauseBreak = i;
        }
        if (spaceBreak < 0 && next !== undefined && /\s/.test(next)) {
          spaceBreak = i;
        }
      }

      if (sentenceBreak > start) end = sentenceBreak;
      else if (clauseBreak > start) end = clauseBreak;
      else if (spaceBreak > start) end = spaceBreak;
    }

    if (end <= start) end = Math.min(length, start + safeMax);
    push(start, end);
    cursor = end;
  }

  return chunks;
}

export function countReadableCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}

/* --------------------------------------------------- ritmo da leitura */

export interface PreparedPageSpeech {
  /** Blocos com offsets no texto da página (usados para destacar na tela). */
  chunks: TextChunk[];
  /** O que a voz fala, um item por bloco. */
  spoken: string[];
  /** Silêncio, em ms, antes de cada bloco. */
  gaps: number[];
  /** Se o bloco é um título (para pausar em volta dele). */
  headings: boolean[];
}

const HEADING_MAX_LENGTH = 72;

/** Título costuma ser uma linha curta, inteira e sem pontuação final. */
function looksLikeHeading(raw: string, isLast: boolean): boolean {
  const trimmed = raw.trim();
  if (!trimmed || isLast) return false;
  if (trimmed.length > HEADING_MAX_LENGTH) return false;
  if (/\n/.test(trimmed)) return false;
  if (/[.!?…]$/.test(trimmed)) return false;
  return true;
}

/**
 * Separa o que a voz fala do que a tela destaca e calcula o silêncio entre
 * blocos. As quatro listas têm sempre o mesmo comprimento, então o índice do
 * bloco falado é o mesmo do trecho destacado.
 */
export function preparePageSpeech(raw: string): PreparedPageSpeech {
  const chunks = splitIntoChunks(raw);
  const spoken: string[] = [];
  const gaps: number[] = [];
  const headings: boolean[] = [];

  chunks.forEach((chunk, index) => {
    spoken.push(toSpeechText(chunk.text));
    const heading = looksLikeHeading(chunk.text, index === chunks.length - 1);
    headings.push(heading);

    if (index === 0) {
      gaps.push(0);
      return;
    }
    if (heading) {
      gaps.push(700); // respira antes do título
    } else if (headings[index - 1]) {
      gaps.push(450); // e depois dele
    } else if (/[.!?…]$/.test(chunks[index - 1].text.trim())) {
      gaps.push(120); // fim de frase
    } else {
      gaps.push(60); // emenda no meio da frase: quase imperceptível
    }
  });

  return { chunks, spoken, gaps, headings };
}
