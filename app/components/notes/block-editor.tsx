"use client";
import {memo,useEffect,useRef,useState} from "react";
import type {Block,PartialBlock} from "@blocknote/core";
import {ja} from "@blocknote/core/locales";
import {SideMenuExtension} from "@blocknote/core/extensions";
import {useCreateBlockNote,useBlockNoteEditor,useComponentsContext,useExtensionState,useEditorSelectionChange,usePortalElement,SideMenu,SideMenuController,DragHandleMenu,RemoveBlockItem,TableRowHeaderItem,TableColumnHeaderItem} from "@blocknote/react";
import {BlockNoteView} from "@blocknote/mantine";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import {GripVertical} from "lucide-react";
import type {NoteSnapshot} from "../../../lib/daily-notes-store";
import {isNoteDocument,noteContentKey,type NoteDocument} from "../../../lib/note-document";
const TYPES=[{type:"paragraph",label:"本文",key:0},{type:"heading",label:"見出し1",level:1,key:1},{type:"heading",label:"見出し2",level:2,key:2},{type:"heading",label:"見出し3",level:3,key:3},{type:"checkListItem",label:"チェックリスト",key:4},{type:"bulletListItem",label:"箇条書き",key:5},{type:"numberedListItem",label:"番号付きリスト",key:6},{type:"toggleListItem",label:"折りたたみ",key:7},{type:"codeBlock",label:"コード",key:8},{type:"quote",label:"引用"}] as const;
type Choice=typeof TYPES[number];
function inlineText(content:Block["content"]):string{if(!Array.isArray(content))return content&&"rows"in content?content.rows.map(r=>r.cells.map(c=>Array.isArray(c)?c.map(i=>"text"in i?i.text:"").join(""):"content"in c?inlineText(c.content):"").join("\t")).join("\n"):"";return content.map(i=>"text"in i?i.text:"content"in i?inlineText(i.content):"").join("");}
function changeBlock(editor:ReturnType<typeof useCreateBlockNote>,block:Block,choice:Choice){
  const text=inlineText(block.content),props="level"in choice?{level:choice.level}:{};
  // Flattening a table retains every cell's text; undo restores its structure.
  const content=block.type==="table"||choice.type==="codeBlock"?[{type:"text"as const,text,styles:{}}]:block.content;
  editor.updateBlock(block,{type:choice.type,props,content} as PartialBlock);editor.focus();
}
function BlockActions({editor,block}:{editor:ReturnType<typeof useCreateBlockNote>;block:Block}){
  const components=useComponentsContext()!,modifier=/Mac|iPhone|iPad/.test(navigator.platform)?"⌘⌥":"Ctrl⇧";
  return <>{TYPES.map(choice=><components.Generic.Menu.Item key={choice.label} className="bn-menu-item" onClick={()=>changeBlock(editor,block,choice)}>{choice.label}{"key"in choice&&<span className="note-menu-key">{modifier}{choice.key}</span>}</components.Generic.Menu.Item>)}<components.Generic.Menu.Item className="bn-menu-item" onClick={()=>{editor.insertBlocks([{type:"table",content:{type:"tableContent",rows:[{cells:[[],[]]},{cells:[[],[]]}]}}],block,"after");editor.focus();}}>表を挿入</components.Generic.Menu.Item><components.Generic.Menu.Item className="bn-menu-item" onClick={()=>editor.removeBlocks([block])}>削除</components.Generic.Menu.Item></>;
}
function BlockMenu(){
  const editor=useBlockNoteEditor();
  const block=useExtensionState(SideMenuExtension,{editor,selector:s=>s?.block});
  if(!block)return null;
  return <DragHandleMenu><BlockActions editor={editor} block={block as Block}/><TableRowHeaderItem>見出し行</TableRowHeaderItem><TableColumnHeaderItem>見出し列</TableColumnHeaderItem></DragHandleMenu>;
}
function TouchBlockHandle(){
  const editor=useBlockNoteEditor(),portal=usePortalElement(),components=useComponentsContext()!,[active,setActive]=useState<{block:Block;top:number}|null>(null),frame=useRef(0);
  const update=()=>{if(frame.current)cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{frame.current=0;if(!matchMedia("(hover:none), (pointer:coarse)").matches)return;try{const block=editor.getTextCursorPosition().block,shell=editor.domElement?.closest(".block-note-shell"),node=editor.domElement?.querySelector(`[data-id="${CSS.escape(block.id)}"]`);if(shell&&node)setActive({block,top:node.getBoundingClientRect().top-shell.getBoundingClientRect().top+shell.scrollTop});}catch{/* The view is not mounted yet. */}});};
  useEditorSelectionChange(update,editor);
  useEffect(()=>{const unsubscribe=editor.onChange(update),media=matchMedia("(hover:none), (pointer:coarse)");window.addEventListener("resize",update);media.addEventListener("change",update);update();return()=>{unsubscribe();window.removeEventListener("resize",update);media.removeEventListener("change",update);cancelAnimationFrame(frame.current);};},[editor]);
  if(!active)return null;
  return <components.Generic.Menu.Root position="bottom" portalElement={portal}><components.Generic.Menu.Trigger><button type="button" className="touch-block-handle" style={{top:active.top}} aria-label="ブロックの種類を変更"><GripVertical size={18}/></button></components.Generic.Menu.Trigger><components.Generic.Menu.Dropdown className="bn-menu-dropdown"><BlockActions editor={editor} block={active.block}/></components.Generic.Menu.Dropdown></components.Generic.Menu.Root>;
}
export default memo(function BlockEditor({note,onChange,onFocusChange}:{note:NoteSnapshot;onChange(markdown:string,document:NoteDocument):void;onFocusChange(active:boolean):void}){
  const initial=useRef(note),changed=useRef(onChange);changed.current=onChange;
  const lastGood=useRef<PartialBlock[]>(note.document?.blocks as PartialBlock[]??[]);
  const syncing=useRef(false),last=useRef(noteContentKey(note)),[error,setError]=useState("");
  const editor=useCreateBlockNote({dictionary:{...ja,placeholders:{...ja.placeholders,default:"メモを書く、または / で追加"}},initialContent:note.document?.blocks as PartialBlock[]|undefined});
  useEffect(()=>{editor.domElement?.setAttribute("aria-label","日別メモ");},[editor]);
  useEffect(()=>editor.onBeforeChange(({tr})=>{if(tr.doc.textContent.length>100000){setError("メモは10万文字以内にしてください");return false;}}),[editor]);
  useEffect(()=>{
    if(initial.current.document)return;
    syncing.current=true;
    try{const blocks=editor.tryParseMarkdownToBlocks(initial.current.markdown);if(blocks.length)editor.replaceBlocks(editor.document,blocks);}catch{editor.replaceBlocks(editor.document,[{type:"paragraph",content:initial.current.markdown}]);}
    finally{lastGood.current=JSON.parse(JSON.stringify(editor.document));syncing.current=false;}
  },[editor]);
  // Remote refreshes and conflict resolution replace content only when it differs
  // from our last edit. Save acknowledgements never reset selection or undo.
  useEffect(()=>{const key=noteContentKey(note);if(key===last.current)return;last.current=key;syncing.current=true;try{const blocks=note.document?.blocks as PartialBlock[]|undefined;editor.replaceBlocks(editor.document,blocks??editor.tryParseMarkdownToBlocks(note.markdown));}finally{lastGood.current=JSON.parse(JSON.stringify(editor.document));syncing.current=false;}},[note.markdown,note.document,editor]);
  return <div className="block-note-shell" onFocusCapture={()=>onFocusChange(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))onFocusChange(false);}} onKeyDownCapture={e=>{
    if(e.nativeEvent.isComposing)return;
    const modifiers=(e.ctrlKey&&e.shiftKey&&!e.altKey&&!e.metaKey)||(e.metaKey&&e.altKey&&!e.ctrlKey);
    const digit=/^Digit([0-8])$/.exec(e.code)?.[1]??(/^[0-8]$/.test(e.key)?e.key:undefined);
    if(modifiers&&digit!==undefined){e.preventDefault();e.stopPropagation();const choice=TYPES.find(c=>"key"in c&&c.key===Number(digit));if(choice){const selected=editor.getSelection()?.blocks??[editor.getTextCursorPosition().block];editor.transact(()=>selected.forEach(block=>changeBlock(editor,block as Block,choice)));}}
    else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==="e"){e.preventDefault();e.stopPropagation();editor.toggleStyles({code:true});}
  }}><BlockNoteView editor={editor} theme="light" sideMenu={false} onChange={()=>{
    if(syncing.current)return;
    const document:NoteDocument={format:"blocknote",version:1,blocks:JSON.parse(JSON.stringify(editor.document)) as Record<string,unknown>[]},markdown=editor.blocksToMarkdownLossy();
    if(markdown.length>100000||!isNoteDocument(document)){setError("メモの上限を超える入力を取り消しました");queueMicrotask(()=>{syncing.current=true;try{editor.replaceBlocks(editor.document,lastGood.current);}finally{syncing.current=false;}});return;}
    setError("");lastGood.current=document.blocks as PartialBlock[];last.current=noteContentKey({markdown,document});changed.current(markdown,document);
  }}><SideMenuController sideMenu={props=><SideMenu {...props} dragHandleMenu={BlockMenu}/>}/><TouchBlockHandle/></BlockNoteView>{error&&<p role="alert" className="note-editor-error">{error}</p>}</div>;
});
