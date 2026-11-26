/** The server tells the shell where the error log lives (`see paths`) in a data attribute on <body>. */
export function errorLogLabel(): string {
  if (typeof document === 'undefined') return 'the error log';
  return document.body?.dataset.errorLog || 'the error log';
}
