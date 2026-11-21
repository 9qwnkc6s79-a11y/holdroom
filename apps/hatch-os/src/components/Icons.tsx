import { IconChevronDown, IconCopy, IconDownload, IconFile, IconFolder, IconMessage, IconPaperclip, IconArrowUp, IconDots, IconMic, IconX } from "@/components/os/Icons";

export function ChatIcon() {
  return <IconMessage size={20} />;
}
export function AskIcon() {
  return <IconMessage size={20} />;
}
export function FilesIcon() {
  return <IconFolder size={20} />;
}
export function RoomsIcon() {
  return <IconFolder size={20} />;
}
export function LibraryIcon() {
  return <IconFile size={20} />;
}
export function MoreIcon() {
  return <IconDots size={20} />;
}
export function SendIcon() {
  return <IconArrowUp size={18} />;
}
export function MicIcon() {
  return <IconMic size={18} />;
}
export function ChevronIcon() {
  return (
    <span className="workspace-caret">
      <IconChevronDown size={12} />
    </span>
  );
}
export function CloseIcon() {
  return <IconX size={18} />;
}
export function DownloadIcon() {
  return <IconDownload size={18} />;
}
export function CopyIcon() {
  return <IconCopy size={18} />;
}
export function PaperclipIcon() {
  return <IconPaperclip size={18} />;
}
