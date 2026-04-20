const DB_NAME = "quicknotes-db";
const DB_VERSION = 1;
const STORE_NOTES = "notes";
const STORE_FOLDERS = "folders";
const WITHOUT_FOLDER_ID = null;

const appState = {
    db: null,
    folders: [],
    notes: [],
    activeFolderId: WITHOUT_FOLDER_ID,
    activeNoteId: null,
    searchQuery: "",
};

const els = {
    folderList: document.getElementById("folder-list"),
    notesList: document.getElementById("notes-list"),
    addFolderBtn: document.getElementById("add-folder-btn"),
    addNoteBtn: document.getElementById("add-note-btn"),
    deleteNoteBtn: document.getElementById("delete-note-btn"),
    searchInput: document.getElementById("search-input"),
    noteTitle: document.getElementById("note-title"),
    noteContent: document.getElementById("note-content"),
    noteFolder: document.getElementById("note-folder"),
    editorArea: document.getElementById("editor-area"),
    editorEmpty: document.getElementById("editor-empty"),
    createdAt: document.getElementById("created-at"),
    updatedAt: document.getElementById("updated-at"),
    toolbar: document.getElementById("editor-toolbar"),
    insertLinkBtn: document.getElementById("insert-link-btn"),
    insertImageBtn: document.getElementById("insert-image-btn"),
    imageInput: document.getElementById("image-input"),
    exportBtn: document.getElementById("export-btn"),
    importBtn: document.getElementById("import-btn"),
    importFile: document.getElementById("import-file"),
    toast: document.getElementById("toast"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
    try {
        appState.db = await openDatabase();
        await loadAllData();
        bindEvents();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast("Fehler beim Starten der App.");
    }
}

function bindEvents() {
    els.addFolderBtn.addEventListener("click", onAddFolder);
    els.addNoteBtn.addEventListener("click", onAddNote);
    els.deleteNoteBtn.addEventListener("click", onDeleteNote);
    els.searchInput.addEventListener("input", (event) => {
        appState.searchQuery = event.target.value.trim().toLowerCase();
        renderNotes();
    });

    // Auto-save for title and content while typing.
    els.noteTitle.addEventListener("input", debounce(onEditorInput, 250));
    els.noteContent.addEventListener("input", debounce(onEditorInput, 250));
    els.noteFolder.addEventListener("change", onFolderChange);

    // Basic rich text commands.
    els.toolbar.addEventListener("click", onToolbarClick);
    els.insertLinkBtn.addEventListener("click", onInsertLink);
    els.insertImageBtn.addEventListener("click", () => els.imageInput.click());
    els.imageInput.addEventListener("change", onInsertImage);

    els.exportBtn.addEventListener("click", onExport);
    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", onImport);
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
                db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_NOTES)) {
                db.createObjectStore(STORE_NOTES, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadAllData() {
    appState.folders = await getAll(STORE_FOLDERS);
    appState.notes = await getAll(STORE_NOTES);

    appState.folders.sort((a, b) => a.name.localeCompare(b.name, "de"));
    appState.notes.sort((a, b) => b.updatedAt - a.updatedAt);

    if (appState.activeNoteId && !appState.notes.some((note) => note.id === appState.activeNoteId)) {
        appState.activeNoteId = null;
    }
}

function getAll(storeName) {
    return new Promise((resolve, reject) => {
        const tx = appState.db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function put(storeName, value) {
    return new Promise((resolve, reject) => {
        const tx = appState.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(value);

        req.onsuccess = () => resolve(value);
        req.onerror = () => reject(req.error);
    });
}

function remove(storeName, key) {
    return new Promise((resolve, reject) => {
        const tx = appState.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function renderAll() {
    renderFolders();
    renderNotes();
    renderEditor();
}

function renderFolders() {
    const container = els.folderList;
    const withoutFolderCount = appState.notes.filter((note) => note.folderId === WITHOUT_FOLDER_ID).length;

    const dynamicFolders = appState.folders
        .map((folder) => {
            const count = appState.notes.filter((note) => note.folderId === folder.id).length;
            const active = appState.activeFolderId === folder.id ? "active" : "";
            return `
        <li class="folder-item ${active}" data-folder-id="${folder.id}">
          <div class="folder-row">
            <span>${escapeHtml(folder.name)} (${count})</span>
            <div class="folder-controls">
              <button class="icon-btn" data-action="rename-folder" data-folder-id="${folder.id}" title="Umbenennen">✎</button>
              <button class="icon-btn" data-action="delete-folder" data-folder-id="${folder.id}" title="Löschen">🗑</button>
            </div>
          </div>
        </li>
      `;
        })
        .join("");

    const noFolderActive = appState.activeFolderId === WITHOUT_FOLDER_ID ? "active" : "";
    container.innerHTML = `
    <li class="folder-item ${noFolderActive}" data-folder-id="without-folder">
      <div class="folder-row">
        <span>Ohne Ordner (${withoutFolderCount})</span>
      </div>
    </li>
    ${dynamicFolders || ""}
    ${appState.folders.length === 0 ? '<li class="empty-state">Keine eigenen Ordner vorhanden.</li>' : ""}
  `;

    container.querySelectorAll(".folder-item").forEach((item) => {
        item.addEventListener("click", (event) => {
            if (event.target.dataset.action) return;
            const idAttr = item.dataset.folderId;
            appState.activeFolderId = idAttr === "without-folder" ? WITHOUT_FOLDER_ID : idAttr;
            renderFolders();
            renderNotes();
        });
    });

    container.querySelectorAll("button[data-action='rename-folder']").forEach((button) => {
        button.addEventListener("click", onRenameFolder);
    });

    container.querySelectorAll("button[data-action='delete-folder']").forEach((button) => {
        button.addEventListener("click", onDeleteFolder);
    });
}

function getFilteredNotes() {
    return appState.notes.filter((note) => {
        const matchesFolder = note.folderId === appState.activeFolderId;
        const searchText = `${note.title} ${stripHtml(note.content)}`.toLowerCase();
        const matchesSearch = appState.searchQuery ? searchText.includes(appState.searchQuery) : true;
        return matchesFolder && matchesSearch;
    });
}

function renderNotes() {
    const notes = getFilteredNotes();

    els.notesList.innerHTML = notes
        .map((note) => {
            const active = note.id === appState.activeNoteId ? "active" : "";
            return `
        <li class="note-item ${active}" data-note-id="${note.id}">
          <div class="note-title">${escapeHtml(note.title || "Unbenannte Notiz")}</div>
          <div class="note-preview">${escapeHtml(stripHtml(note.content).slice(0, 90) || "(leer)")}</div>
          <div class="note-preview">Geändert: ${formatDate(note.updatedAt)}</div>
        </li>
      `;
        })
        .join("");

    if (notes.length === 0) {
        els.notesList.innerHTML = '<li class="empty-state">Keine Notizen gefunden.</li>';
    }

    els.notesList.querySelectorAll(".note-item").forEach((item) => {
        item.addEventListener("click", () => {
            appState.activeNoteId = item.dataset.noteId;
            renderNotes();
            renderEditor();
        });
    });
}

function renderEditor() {
    const note = appState.notes.find((entry) => entry.id === appState.activeNoteId);

    if (!note) {
        els.editorArea.classList.add("hidden");
        els.editorEmpty.classList.remove("hidden");
        els.deleteNoteBtn.disabled = true;
        return;
    }

    els.editorArea.classList.remove("hidden");
    els.editorEmpty.classList.add("hidden");
    els.deleteNoteBtn.disabled = false;

    renderFolderSelect();
    els.noteTitle.value = note.title;
    els.noteFolder.value = note.folderId ?? "without-folder";
    els.noteContent.innerHTML = note.content;
    els.createdAt.textContent = `Erstellt: ${formatDate(note.createdAt)}`;
    els.updatedAt.textContent = `Geändert: ${formatDate(note.updatedAt)}`;
}

async function onAddFolder() {
    const name = prompt("Name des neuen Ordners:");
    if (!name) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const folder = {
        id: crypto.randomUUID(),
        name: trimmedName,
        createdAt: Date.now(),
    };

    appState.folders.push(folder);
    appState.folders.sort((a, b) => a.name.localeCompare(b.name, "de"));
    await put(STORE_FOLDERS, folder);
    renderFolders();
}

async function onRenameFolder(event) {
    const folderId = event.currentTarget.dataset.folderId;
    const folder = appState.folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const nextName = prompt("Neuer Name:", folder.name);
    if (!nextName || !nextName.trim()) return;

    folder.name = nextName.trim();
    await put(STORE_FOLDERS, folder);
    appState.folders.sort((a, b) => a.name.localeCompare(b.name, "de"));
    renderFolders();
}

async function onDeleteFolder(event) {
    const folderId = event.currentTarget.dataset.folderId;
    const folder = appState.folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const ok = confirm(`Ordner "${folder.name}" löschen? Enthaltene Notizen werden nach "Ohne Ordner" verschoben.`);
    if (!ok) return;

    const movedNotes = [];
    appState.notes = appState.notes.map((note) => {
        if (note.folderId === folderId) {
            const updatedNote = { ...note, folderId: WITHOUT_FOLDER_ID, updatedAt: Date.now() };
            movedNotes.push(updatedNote);
            return updatedNote;
        }
        return note;
    });

    await Promise.all(movedNotes.map((note) => put(STORE_NOTES, note)));

    appState.folders = appState.folders.filter((entry) => entry.id !== folderId);
    if (appState.activeFolderId === folderId) {
        appState.activeFolderId = WITHOUT_FOLDER_ID;
    }

    await remove(STORE_FOLDERS, folderId);
    renderAll();
}

async function onAddNote() {
    const now = Date.now();
    const note = {
        id: crypto.randomUUID(),
        title: "Neue Notiz",
        content: "",
        folderId: appState.activeFolderId,
        createdAt: now,
        updatedAt: now,
    };

    appState.notes.unshift(note);
    appState.activeNoteId = note.id;

    await put(STORE_NOTES, note);
    renderAll();
}

async function onDeleteNote() {
    const note = appState.notes.find((entry) => entry.id === appState.activeNoteId);
    if (!note) return;

    const ok = confirm(`Notiz "${note.title || "Unbenannt"}" wirklich löschen?`);
    if (!ok) return;

    appState.notes = appState.notes.filter((entry) => entry.id !== note.id);
    appState.activeNoteId = null;

    await remove(STORE_NOTES, note.id);
    renderAll();
}

function renderFolderSelect() {
    const options = [
        '<option value="without-folder">Ohne Ordner</option>',
        ...appState.folders.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`),
    ];

    els.noteFolder.innerHTML = options.join("");
}

async function onFolderChange(event) {
    const note = appState.notes.find((entry) => entry.id === appState.activeNoteId);
    if (!note) return;

    note.folderId = event.target.value === "without-folder" ? WITHOUT_FOLDER_ID : event.target.value;
    note.updatedAt = Date.now();

    await put(STORE_NOTES, note);
    renderAll();
}

async function onEditorInput() {
    const note = appState.notes.find((entry) => entry.id === appState.activeNoteId);
    if (!note) return;

    note.title = els.noteTitle.value.trim() || "Unbenannte Notiz";
    note.content = sanitizeEditorHtml(els.noteContent.innerHTML);
    note.updatedAt = Date.now();

    await put(STORE_NOTES, note);
    renderNotes();
    els.updatedAt.textContent = `Geändert: ${formatDate(note.updatedAt)}`;
}

function onToolbarClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const command = button.dataset.command;
    const color = button.dataset.color;
    const size = button.dataset.size;

    if (command === "bold") {
        document.execCommand("bold");
        els.noteContent.focus();
        onEditorInput();
        return;
    }

    if (color) {
        document.execCommand("styleWithCSS", false, true);
        document.execCommand("foreColor", false, color);
        els.noteContent.focus();
        onEditorInput();
        return;
    }

    if (size) {
        applyTextStyle(size);
        onEditorInput();
    }
}

function applyTextStyle(type) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        showToast("Bitte markiere zuerst Text für die Größenformatierung.");
        return;
    }

    const range = selection.getRangeAt(0);
    const span = document.createElement("span");

    if (type === "headline") {
        span.style.fontSize = "32px";
        span.style.fontWeight = "700";
    } else if (type === "subheadline") {
        span.style.fontSize = "24px";
        span.style.fontWeight = "600";
    } else {
        span.style.fontSize = "16px";
        span.style.fontWeight = "400";
    }

    span.appendChild(range.extractContents());
    range.insertNode(span);

    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.addRange(newRange);
}

function onInsertLink() {
    const url = prompt("Link-URL eingeben (https://...):");
    if (!url) return;

    document.execCommand("createLink", false, url.trim());
    els.noteContent.focus();
    onEditorInput();
}

function onInsertImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showToast("Bitte eine Bilddatei auswählen.");
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const src = reader.result;
        document.execCommand("insertImage", false, src);
        els.noteContent.focus();
        onEditorInput();
    };
    reader.onerror = () => showToast("Bild konnte nicht geladen werden.");
    reader.readAsDataURL(file);

    event.target.value = "";
}

async function onExport() {
    const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        folders: appState.folders,
        notes: appState.notes,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quicknotes-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function onImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        validateImportData(data);
        await replaceDatabaseData(data);

        await loadAllData();
        appState.activeFolderId = WITHOUT_FOLDER_ID;
        appState.activeNoteId = null;
        renderAll();
        showToast("Import erfolgreich.");
    } catch (error) {
        console.error(error);
        showToast(`Import fehlgeschlagen: ${error.message}`);
    } finally {
        event.target.value = "";
    }
}

function validateImportData(data) {
    if (!data || typeof data !== "object") {
        throw new Error("Datei ist kein gültiges JSON-Objekt.");
    }

    if (!Array.isArray(data.folders) || !Array.isArray(data.notes)) {
        throw new Error("JSON muss 'folders' und 'notes' als Arrays enthalten.");
    }

    for (const folder of data.folders) {
        if (!folder.id || typeof folder.name !== "string") {
            throw new Error("Ungültiger Ordner in Importdaten.");
        }
    }

    for (const note of data.notes) {
        const validFolderId = note.folderId === null || typeof note.folderId === "string";
        const validDates = Number.isFinite(note.createdAt) && Number.isFinite(note.updatedAt);
        if (!note.id || typeof note.title !== "string" || typeof note.content !== "string" || !validFolderId || !validDates) {
            throw new Error("Ungültige Notiz in Importdaten.");
        }
    }

    const folderIds = new Set(data.folders.map((folder) => folder.id));
    const orphan = data.notes.find((note) => note.folderId !== null && !folderIds.has(note.folderId));
    if (orphan) {
        throw new Error("Mindestens eine Notiz verweist auf einen unbekannten Ordner.");
    }
}

async function replaceDatabaseData(data) {
    const tx = appState.db.transaction([STORE_FOLDERS, STORE_NOTES], "readwrite");
    const folderStore = tx.objectStore(STORE_FOLDERS);
    const noteStore = tx.objectStore(STORE_NOTES);

    await requestToPromise(folderStore.clear());
    await requestToPromise(noteStore.clear());

    for (const folder of data.folders) {
        await requestToPromise(folderStore.put(folder));
    }

    for (const note of data.notes) {
        await requestToPromise(noteStore.put(note));
    }
}

function requestToPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function sanitizeEditorHtml(html) {
    // Basic cleanup, removes script tags while keeping rich text markup.
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim();
}

function formatDate(timestamp) {
    if (!timestamp) return "–";
    return new Date(timestamp).toLocaleString("de-DE");
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function stripHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    setTimeout(() => els.toast.classList.add("hidden"), 2600);
}