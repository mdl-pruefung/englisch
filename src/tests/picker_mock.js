// Testhilfe: ersetzt das „Speichern unter“-Fenster (showSaveFilePicker), das sich im Testbrowser nicht bedienen lässt.
// window.__pickerMode = "abort" → wie „Abbrechen“; sonst wird gespeichert und die Datei als Download ausgegeben (damit Tests sie auffangen).
window.showSaveFilePicker = async ({ suggestedName }) => {
  if (window.__pickerMode === "abort") throw new DOMException("Der Nutzer hat abgebrochen.", "AbortError");
  return { createWritable: async () => { const parts = []; return {
    write: async b => { parts.push(b); },
    close: async () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(parts)); a.download = suggestedName; document.body.appendChild(a); a.click(); a.remove(); window.__pickerSaved = (window.__pickerSaved || 0) + 1; } }; } };
};
