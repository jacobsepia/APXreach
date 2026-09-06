"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, List, ListOrdered, Redo2, RemoveFormatting, Underline, Undo2 } from "lucide-react";
import styles from "./contact-record-modal.module.css";
import { templateTags } from "@/lib/email-templates";

type Props = { value: string; disabled: boolean; firstName: string; onChange: (html: string, text: string) => void; toolbarEnd?: React.ReactNode; belowToolbar?: React.ReactNode; allowTags?: boolean };
const fonts = ["Arial", "Verdana", "Georgia", "Tahoma", "Times New Roman", "Courier New"];
const sizes = [10, 12, 14, 16, 18, 20, 24, 28, 32];

export default function EmailEditor({ value, disabled, firstName, onChange, toolbarEnd, belowToolbar, allowTags }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, code: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false }, trailingNode: false }),
      TextStyleKit.configure({ color: false, backgroundColor: false, lineHeight: false }),
      TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right"] }),
    ],
    content: value || "<p></p>",
    editable: !disabled,
    editorProps: { attributes: { role: "textbox", "aria-label": "Message", "aria-multiline": "true", class: styles.richInput } },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML(), current.getText({ blockSeparator: "\n" })),
  });
  const state = useEditorState({ editor, selector: ({ editor: current }) => current ? ({
    bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"),
    bullet: current.isActive("bulletList"), numbered: current.isActive("orderedList"),
    align: current.getAttributes("paragraph").textAlign || "left",
    font: current.getAttributes("textStyle").fontFamily || "Arial", size: current.getAttributes("textStyle").fontSize || "14px",
    undo: current.can().undo(), redo: current.can().redo(), empty: current.isEmpty,
  }) : null });

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(value === "" && editor.isEmpty)) editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
  }, [editor, value]);

  if (!editor || !state) return <div className={styles.editorLoading}>Loading editor…</div>;
  const buttons = [
    { name: "Bold", Icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { name: "Italic", Icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { name: "Underline", Icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { name: "Bullet list", Icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { name: "Numbered list", Icon: ListOrdered, active: state.numbered, run: () => editor.chain().focus().toggleOrderedList().run() },
    ...([{ name: "Align left", Icon: AlignLeft, value: "left" }, { name: "Align center", Icon: AlignCenter, value: "center" }, { name: "Align right", Icon: AlignRight, value: "right" }]).map(item => ({ ...item, active: state.align === item.value, run: () => editor.chain().focus().setTextAlign(item.value).run() })),
  ];
  return <div className={styles.richEditor}>
    <div className={styles.formatToolbar} role="group" aria-label="Email formatting">
      <select aria-label="Font family" value={fonts.includes(state.font) ? state.font : "Arial"} disabled={disabled} onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}>
        {fonts.map(font => <option key={font} value={font}>{font}</option>)}
      </select>
      <select aria-label="Font size" value={sizes.some(size => `${size}px` === state.size) ? state.size : "14px"} disabled={disabled} onChange={e => editor.chain().focus().setFontSize(e.target.value).run()}>
        {sizes.map(size => <option key={size} value={`${size}px`}>{size}</option>)}
      </select>
      <span className={styles.formatDivider} />
      {buttons.map(({ name, Icon, active, run }) => <button key={name} type="button" aria-label={name} title={name} aria-pressed={active} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={run}><Icon size={15} /></button>)}
      <span className={styles.formatDivider} />
      <button type="button" aria-label="Undo" title="Undo" disabled={disabled || !state.undo} onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={15} /></button>
      <button type="button" aria-label="Redo" title="Redo" disabled={disabled || !state.redo} onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={15} /></button>
      <button type="button" aria-label="Clear formatting" title="Clear formatting" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run()}><RemoveFormatting size={15} /></button>
      {allowTags && <select aria-label="Insert message tag" value="" disabled={disabled} onChange={e => { if (e.target.value) editor.chain().focus().insertContent(`{{${e.target.value}}}`).run(); }}><option value="">Insert tag…</option>{Object.entries(templateTags).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
      {toolbarEnd && <div className={styles.toolbarEnd}>{toolbarEnd}</div>}
    </div>
    {belowToolbar}
    <div className={styles.editorSurface}>
      {state.empty && <span className={styles.editorPlaceholder}>Hi {firstName},</span>}
      <EditorContent editor={editor} className={styles.editorMount} />
    </div>
  </div>;
}
