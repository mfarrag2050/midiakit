#!/usr/bin/env node
// فحص نقاء المحرك — يفشل البناء عند مخالفة القاعدة الوحيدة (docs/05 §القاعدة الوحيدة):
//   لا document · لا window · لا localStorage · لا متغير وحدة قابل للتغيير.
//
// يمشي على packages/engine/src ويرفض:
//   • هوية عارية: document / window / localStorage / navigator / self / globalThis
//     (خارج تعليقات أو تسميات في types).
//   • let أو var على مستوى الوحدة (متغير قابل للتغيير مشترك).
//
// خرج غير صفري ⇒ CI يفشل.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENGINE_SRC = path.resolve(__dirname, '..', 'packages', 'engine', 'src');

const BANNED_IDENTIFIERS = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'navigator',
  'self',
  'globalThis',
];

const violations = [];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(p);
    } else if (entry.isFile() && p.endsWith('.ts') && !p.endsWith('.d.ts')) {
      await check(p);
    }
  }
}

/** يزيل التعليقات (سطر + كتلة) والسلاسل النصية قبل الفحص، حتى لا تُعطي إيجابيات كاذبة. */
function stripSourceNoise(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // تعليق سطر //
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    // تعليق كتلة /* */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    // سلاسل: ' " ` (نتعامل مع الأخيرة بسذاجة كافية للفحص)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ' ';
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i++; // تخطَّ الحرف الملتف
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i++;
      continue;
    }
    if (ch === '`') {
      out += ' ';
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') i++;
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i++;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

async function check(file) {
  const raw = await fs.readFile(file, 'utf8');
  const clean = stripSourceNoise(raw);
  const rel = path.relative(process.cwd(), file);
  const lines = clean.split('\n');

  // 1) هويّات محظورة (كلمة كاملة).
  for (const id of BANNED_IDENTIFIERS) {
    const re = new RegExp(`\\b${id}\\b`, 'g');
    lines.forEach((line, idx) => {
      if (re.test(line)) {
        violations.push({
          file: rel,
          line: idx + 1,
          kind: 'banned-identifier',
          detail: id,
          snippet: line.trim().slice(0, 100),
        });
      }
    });
  }

  // 2) let أو var على مستوى الوحدة.
  //    نعتمد على مسبار مضغوط: نُتبِّع عمق الأقواس المعقوفة {}.
  let depth = 0;
  lines.forEach((line, idx) => {
    // نحسب البادئة قبل التصاق الرمز
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (depth === 0) {
      // اسمح بـ export let/var أيضاً — كلاهما ممنوع.
      if (
        /^(export\s+)?(let|var)\s+[A-Za-z_$]/.test(trimmed)
      ) {
        violations.push({
          file: rel,
          line: idx + 1,
          kind: 'module-mutable',
          detail: /^(export\s+)?let\b/.test(trimmed) ? 'let' : 'var',
          snippet: trimmed.slice(0, 100),
        });
      }
    }
    // حدّث العمق بعد فحص السطر
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
  });
}

await walk(ENGINE_SRC);

if (violations.length > 0) {
  console.error(
    `[engine-purity] فشل: ${violations.length} مخالفة في packages/engine/src`
  );
  for (const v of violations) {
    console.error(
      `  ${v.file}:${v.line}  ${v.kind} (${v.detail})  ← ${v.snippet}`
    );
  }
  process.exit(1);
}

console.log('[engine-purity] نظيف — المحرك يحترم القاعدة الوحيدة.');
