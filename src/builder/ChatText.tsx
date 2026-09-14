import { Fragment } from 'react';

// Render a small, streaming-friendly Markdown subset as React text. Provider
// content never becomes HTML, including links, tags, and incomplete markup.
const inline = (text: string) => text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
  part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code>
      : <Fragment key={index}>{part}</Fragment>);

export default function ChatText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (!line.trim()) { index++; continue; }
    const key = index;
    if (line.startsWith('```')) {
      const code: string[] = []; index++;
      while (index < lines.length && !lines[index]!.startsWith('```')) code.push(lines[index++]!);
      index++;
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>);
    } else if (/^#{1,3} /.test(line)) {
      blocks.push(<h4 key={key}>{inline(line.replace(/^#{1,3} /, ''))}</h4>); index++;
    } else if (/^\s*(?:[-*] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\. /.test(line);
      const pattern = ordered ? /^\s*\d+\. / : /^\s*[-*] /;
      const items = [];
      while (index < lines.length && pattern.test(lines[index]!)) {
        items.push(<li key={index}>{inline(lines[index++]!.replace(pattern, ''))}</li>);
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    } else {
      const paragraph = [line]; index++;
      while (index < lines.length && lines[index]!.trim() && !/^(?:```|#{1,3} |\s*(?:[-*] |\d+\. ))/.test(lines[index]!)) paragraph.push(lines[index++]!);
      blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
    }
  }
  return <div>{blocks}</div>;
}
