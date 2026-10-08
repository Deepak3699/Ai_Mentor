 import React from 'react';

const bashCommands = new Set([
  'npm', 'npx', 'yarn', 'mkdir', 'cd', 'ls',
  'GET', 'POST', 'PUT', 'DELETE',
]);

const jsKeywords = new Set([
  'const', 'let', 'var', 'function', 'return', 'if',
  'else', 'for', 'while', 'import', 'export', 'from',
  'require', 'async', 'await',
]);

const highlightLine = (line, language) => {
  if (language === 'bash') {
    let firstToken = true;

    return line.split(/(\s+)/).map((part, index) => {
      if (!part || /^\s+$/.test(part)) return part;

      const isCommand = firstToken && bashCommands.has(part);
      firstToken = false;

      const className = isCommand
        ? 'text-teal-400 font-semibold'
        : part.startsWith('-')
          ? 'text-gray-400'
          : undefined;

      return className ? (
        <span key={index} className={className}>
          {part}
        </span>
      ) : part;
    });
  }

  if (language === 'javascript') {
    const tokenPattern =
      /\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b/g;

    const parts = [];
    let cursor = 0;

    for (const match of line.matchAll(tokenPattern)) {
      const token = match[0];
      const start = match.index;

      parts.push(line.slice(cursor, start));

      let className;

      if (token.startsWith('//')) {
        className = 'text-gray-500 italic';
      } else if (/^["'`]/.test(token)) {
        className = 'text-yellow-300';
      } else if (jsKeywords.has(token)) {
        className = 'text-teal-400 font-bold';
      } else if (/^\d/.test(token)) {
        className = 'text-purple-400';
      } else if (/^\s*\(/.test(line.slice(start + token.length))) {
        className = 'text-blue-300';
      }

      parts.push(
        className ? (
          <span key={start} className={className}>
            {token}
          </span>
        ) : token,
      );

      cursor = start + token.length;
    }

    parts.push(line.slice(cursor));
    return parts;
  }

  return line;
};

const DocCodeBlock = ({ code, language = 'text' }) => {
  return (
    <div className="relative group my-6">
      <div className="absolute -top-3 left-4 px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-md z-10 shadow-sm border border-gray-700">
        {language}
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden shadow-xl border border-gray-800 transition-all duration-300 group-hover:border-gray-700">
        <div className="overflow-x-auto p-4 pt-6">
          <pre className="text-sm text-gray-200 font-mono w-full">
            <code className="block">
              {code.split('\n').map((line, index) => (
                <span key={index} className="flex">
                  <span
                    aria-hidden="true"
                    className="text-gray-600 select-none text-right border-r border-gray-700/50 pr-4 mr-4 w-8 shrink-0"
                  >
                    {index + 1}
                  </span>

                  <span className="whitespace-pre">
                    {highlightLine(line, language)}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export default DocCodeBlock;