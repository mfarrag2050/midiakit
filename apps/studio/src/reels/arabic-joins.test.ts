// 479: guard translated text and its JSX ancestors, not numeric ruler labels.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const files = [
  'apps/studio/src/reels/TimelineStrip.tsx',
  'apps/studio/app/(app)/reels/page.tsx',
];

function forbiddenTextClasses(source: string): string[] {
  const tree = ts.createSourceFile('view.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = new Set<string>();
  const bindings = new Map<string, string>();
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      bindings.set(node.name.getText(tree), node.initializer.getText(tree));
    }
    // Translation calls render Arabic in ar/mixed; itemLabel is the translated clip name.
    const translatedText = ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) &&
      /\bt\(|\bitemLabel\b/.test(node.getText(tree));
    const arabicText = ts.isJsxText(node) && /[\u0600-\u06ff]/.test(node.text);
    if (translatedText || arabicText) {
      for (let ancestor: ts.Node | undefined = node.parent; ancestor; ancestor = ancestor.parent) {
        if (!ts.isJsxElement(ancestor)) continue;
        const classAttr = ancestor.openingElement.attributes.properties.find(
          (attr) => ts.isJsxAttribute(attr) && attr.name.getText(tree) === 'className',
        );
        if (!classAttr || !ts.isJsxAttribute(classAttr) || !classAttr.initializer) continue;
        const initializer = classAttr.initializer;
        const classText = ts.isJsxExpression(initializer) && initializer.expression
          ? bindings.get(initializer.expression.getText(tree)) ?? initializer.getText(tree)
          : initializer.getText(tree);
        if (/\bfont-mono\b|\btracking-/.test(classText)) {
          const line = tree.getLineAndCharacterOfPosition(classAttr.getStart(tree)).line + 1;
          violations.add(`${line}: ${classText}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return [...violations];
}

describe('479 Arabic text keeps joining typography', () => {
  it.each(files)('%s: translated text inherits no mono or tracking class', (file) => {
    expect(forbiddenTextClasses(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
