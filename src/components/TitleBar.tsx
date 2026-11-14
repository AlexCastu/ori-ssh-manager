export function TitleBar() {
  if (!navigator.userAgent.includes('Mac')) return null;

  return <div data-tauri-drag-region className="h-7 w-full shrink-0" />;
}
