"use client";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default memo(function MarkdownPreview({ markdown }: { markdown: string }) {
  return <div className="note-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{a: props => <a href={props.href} title={props.title} target="_blank" rel="noopener noreferrer">{props.children}</a>}}>{markdown}</Markdown></div>;
});
