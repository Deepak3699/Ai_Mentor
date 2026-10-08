import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import DocCodeBlock from '../components/common/DocElements/DocCodeBlock';

afterEach(cleanup);

const getSourceLines = (container) =>
  Array.from(container.querySelector('code').children).map(
    (row) => row.lastElementChild.textContent,
  );

describe('DocCodeBlock', () => {
  const samples = [
    '<h1>Hello</h1>',
    '<img src=x onerror="window.__docXss = true">',
    '<svg onload="window.__docXss = true"></svg>',
    '<script>window.__docXss = true</script>',
    `"double" 'single' & < > &lt; &#60;`,
  ];

  for (const language of ['text', 'bash', 'javascript']) {
    it.each(samples)(
      `renders unsafe characters literally in ${language}: %s`,
      (code) => {
        const { container } = render(
          <DocCodeBlock code={code} language={language} />,
        );

        expect(getSourceLines(container)).toEqual([code]);

        expect(
          container.querySelector(
            'h1, img, svg, script, [onerror], [onload]',
          ),
        ).toBeNull();
      },
    );
  }

  it('preserves indentation, tabs, blank lines and trailing newline', () => {
    const code = '  first\tline\n\n    last\n';
    const { container } = render(<DocCodeBlock code={code} />);

    expect(getSourceLines(container)).toEqual(code.split('\n'));

    const numbers = Array.from(
      container.querySelectorAll('code [aria-hidden="true"]'),
      (element) => element.textContent,
    );

    expect(numbers).toEqual(['1', '2', '3', '4']);
  });

  it('preserves JavaScript text and highlights normal tokens', () => {
    const code = 'const message = "hello & <world>"; log(42); // comment';
    const { container } = render(
      <DocCodeBlock code={code} language="javascript" />,
    );

    expect(getSourceLines(container)).toEqual([code]);

    const highlighted = (className) =>
      Array.from(
        container.querySelectorAll(`code .${className}`),
        (element) => element.textContent,
      );

    expect(highlighted('text-teal-400')).toContain('const');
    expect(highlighted('text-yellow-300')).toContain('"hello & <world>"');
    expect(highlighted('text-blue-300')).toContain('log');
    expect(highlighted('text-purple-400')).toContain('42');
    expect(highlighted('text-gray-500')).toContain('// comment');
  });

  it('preserves Bash spacing and highlights commands and flags', () => {
    const code = '  npm\tinstall  --save';
    const { container } = render(
      <DocCodeBlock code={code} language="bash" />,
    );

    expect(getSourceLines(container)).toEqual([code]);
    expect(
      container.querySelector('code .text-teal-400').textContent,
    ).toBe('npm');
    expect(
      container.querySelector('code .text-gray-400').textContent,
    ).toBe('--save');
  });

  it('renders an unknown language as literal plain text', () => {
    const code = '<div title="example">A & B</div>';
    const { container } = render(
      <DocCodeBlock code={code} language="unknown" />,
    );

    expect(getSourceLines(container)).toEqual([code]);
    expect(container.querySelector('code div')).toBeNull();
  });
});