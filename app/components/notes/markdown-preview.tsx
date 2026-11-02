"use client";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default memo(function MarkdownPreview({ markdown }: { markdown: string }) {
  return <div className="note-markdown" tabIndex={0} aria-label="メモのプレビュー"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{pre: props => <pre tabIndex={0}>{props.children}</pre>,table: props => <table tabIndex={0}>{props.children}</table>,a: props => <a href={props.href} title={props.title} target="_blank" rel="noopener noreferrer">{props.children}</a>}}>{markdown}</Markdown></div>;
});
