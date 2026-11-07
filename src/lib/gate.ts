/**
 * Porta de entrada do site.
 *
 * IMPORTANTE — o que isto é e o que não é:
 * O GitHub Pages só entrega arquivos estáticos. Qualquer "senha" aqui roda no
 * navegador do visitante, então serve para barrar visita casual, link colado em
 * grupo e robô de busca — NÃO é controle de acesso. Quem souber ler o código
 * acha o hash e pode tentar senhas offline; e quem abrir o DevTools consegue
 * marcar a sessão como destravada sem saber a senha.
 *
 * O que protege de verdade o conteúdo é o PDF não estar num repositório
 * público. Use esta porta como cortesia, não como tranca.
 */

const SESSION_KEY = 'audiobook-pessoal:gate:v1';

/** Sal fixo: muda junto com a senha, se quiser gerar um hash novo. */
const SALT = 'audiobook-marcio::2026';

/**
 * SHA-256 de (senha + SALT), em hexadecimal minúsculo.
 * Enquanto não for um hash válido, a porta fica desligada.
 *
 * Gere com:
 *   node -e "const c=require('crypto');console.log(c.createHash('sha256').update(process.argv[1]+'audiobook-marcio::2026','utf8').digest('hex'))" "SUA-SENHA"
 */
export const PASSWORD_HASH = '151a3382a9955b5af60156a767c4522aaa96dd05d9a44495a9060f767dc128f2';

const HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function isGateConfigured(): boolean {
  return HASH_PATTERN.test(PASSWORD_HASH);
}

export function isUnlocked(): boolean {
  if (!isGateConfigured()) return true;
  try {
    // sessionStorage: fechou a aba, tranca de novo.
    return sessionStorage.getItem(SESSION_KEY) === PASSWORD_HASH.toLowerCase();
  } catch {
    // Modo privado com armazenamento bloqueado: pede a senha de novo.
    return false;
  }
}

export function markUnlocked(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, PASSWORD_HASH.toLowerCase());
  } catch {
    // Sem armazenamento a sessão não persiste; o acesso atual continua valendo.
  }
}

export function lockAgain(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignora
  }
}

async function sha256Hex(input: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/** Comparação de tempo constante, para não vazar o prefixo correto pelo tempo. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  if (!isGateConfigured()) return true;
  const digest = await sha256Hex(candidate.normalize('NFC') + SALT);
  if (!digest) return false;
  return sameHash(digest, PASSWORD_HASH.toLowerCase());
}
