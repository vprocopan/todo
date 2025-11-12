import { useState, useEffect, useCallback, useMemo, FormEvent, ChangeEvent, KeyboardEvent } from "react";
import "./App.css";

// Strongly-typed Todo model
type Todo = {
  id: string; // use string IDs for stability
  text: string;
  done: boolean;
  dueDate?: string | null; // ISO date string (YYYY-MM-DD)
};

type Filter = "all" | "active" | "completed";

type SortMode = "manual" | "due" | "status";

const STORAGE_KEYS = {
  todos: "todos",
  filter: "todos_filter",
  sort: "todos_sort",
} as const;

function safeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return String(Date.now() + Math.random());
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [newDue, setNewDue] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortMode>("manual");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [undoStack, setUndoStack] = useState<Todo[] | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  // Load todos, filter, sort from localStorage when the app starts
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.todos);
      if (saved) {
        const parsed: Todo[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setTodos(parsed);
        }
      }
    } catch {}
    try {
      const savedFilter = localStorage.getItem(STORAGE_KEYS.filter) as Filter | null;
      if (savedFilter === "all" || savedFilter === "active" || savedFilter === "completed") {
        setFilter(savedFilter);
      }
    } catch {}
    try {
      const savedSort = localStorage.getItem(STORAGE_KEYS.sort) as SortMode | null;
      if (savedSort === "manual" || savedSort === "due" || savedSort === "status") {
        setSort(savedSort);
      }
    } catch {}
  }, []);

  // Save todos whenever they change (debounced via microtask)
  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(todos));
    }, 0);
    return () => clearTimeout(id);
  }, [todos]);

  // Persist filter & sort
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.filter, filter);
  }, [filter]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sort, sort);
  }, [sort]);

  const trimmed = newTodo.trim();
  const canAdd = trimmed.length > 0;

  const addTodo = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdd) return;
    const due = newDue || undefined;
    const newTask: Todo = { id: safeId(), text: trimmed, done: false, dueDate: due };
    setTodos(prev => [...prev, newTask]);
    setNewTodo("");
    setNewDue("");
  }, [canAdd, trimmed, newDue]);

  const onInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setNewTodo(e.target.value);
  }, []);

  const onDueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setNewDue(e.target.value);
  }, []);

  const onInputKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setNewTodo("");
      setNewDue("");
    }
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos(prev => {
      const removed = prev.find(t => t.id === id);
      if (!removed) return prev;
      setUndoStack([removed]);
      setUndoMessage(`Deleted "${removed.text}"`);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const startEditing = useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditingText(todo.text);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingText("");
  }, []);

  const saveEditing = useCallback(() => {
    const text = editingText.trim();
    if (editingId == null) return;
    if (text.length === 0) {
      // Empty text deletes the todo
      setTodos(prev => {
        const removed = prev.find(t => t.id === editingId);
        if (removed) {
          setUndoStack([removed]);
          setUndoMessage(`Deleted "${removed.text}"`);
        }
        return prev.filter(t => t.id !== editingId);
      });
    } else {
      setTodos(prev => prev.map(t => t.id === editingId ? { ...t, text } : t));
    }
    setEditingId(null);
    setEditingText("");
  }, [editingId, editingText]);

  const onEditKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditing();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }, [saveEditing, cancelEditing]);

  const clearCompleted = useCallback(() => {
    setTodos(prev => {
      const removed = prev.filter(t => t.done);
      if (removed.length > 0) {
        setUndoStack(removed);
        setUndoMessage(`Cleared ${removed.length} completed item${removed.length === 1 ? "" : "s"}`);
      }
      return prev.filter(t => !t.done);
    });
  }, []);

  const undo = useCallback(() => {
    if (!undoStack || undoStack.length === 0) return;
    setTodos(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const restored = undoStack.filter(t => !existingIds.has(t.id));
      return [...prev, ...restored];
    });
    setUndoStack(null);
    setUndoMessage(null);
  }, [undoStack]);

  const remainingCount = useMemo(() => todos.filter(t => !t.done).length, [todos]);
  const completionPct = useMemo(() => (todos.length === 0 ? 0 : Math.round(((todos.length - remainingCount) / todos.length) * 100)), [todos, remainingCount]);

  const filteredTodos = useMemo(() => {
    let list = todos;
    switch (filter) {
      case "active":
        list = todos.filter(t => !t.done);
        break;
      case "completed":
        list = todos.filter(t => t.done);
        break;
      default:
        list = todos;
    }
    if (sort === "due") {
      return [...list].sort((a, b) => {
        const ad = a.dueDate ?? "";
        const bd = b.dueDate ?? "";
        if (ad === bd) return a.text.localeCompare(b.text);
        if (!ad) return 1; // no due goes last
        if (!bd) return -1;
        return ad.localeCompare(bd);
      });
    } else if (sort === "status") {
      return [...list].sort((a, b) => Number(a.done) - Number(b.done) || a.text.localeCompare(b.text));
    }
    return list; // manual
  }, [todos, filter, sort]);

  const isOverdue = useCallback((t: Todo) => {
    if (!t.dueDate || t.done) return false;
    const today = new Date().toISOString().slice(0, 10);
    return t.dueDate < today;
  }, []);

  return (
    <main className="container">
      <h1 aria-label="Tauri and React Todo App">📝 Tauri + React Todo</h1>

      <form onSubmit={addTodo} className="row" aria-label="Add new todo">
        <input
          value={newTodo}
          onChange={onInputChange}
          onKeyDown={onInputKeyDown}
          placeholder="What do you need to do?"
          aria-label="New todo title"
          autoFocus
        />
        <input
          type="date"
          value={newDue}
          onChange={onDueChange}
          aria-label="Due date (optional)"
        />
        <button type="submit" disabled={!canAdd} aria-disabled={!canAdd} aria-label="Add todo">
          Add
        </button>
      </form>

      <section className="toolbar" aria-label="Todo filters and actions">
        <div className="filters" role="tablist" aria-label="Filters">
          <button role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>All</button>
          <button role="tab" aria-selected={filter === "active"} onClick={() => setFilter("active")}>Active</button>
          <button role="tab" aria-selected={filter === "completed"} onClick={() => setFilter("completed")}>Completed</button>
        </div>
        <div className="sort">
          <label>
            Sort:
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sort todos">
              <option value="manual">Manual</option>
              <option value="due">Due date</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
        <button onClick={clearCompleted} disabled={todos.every(t => !t.done)} aria-disabled={todos.every(t => !t.done)}>
          Clear Completed
        </button>
      </section>

      <section aria-live="polite" aria-atomic="true" className="status-row">
        {todos.length > 0 && (
          <p>
            {remainingCount} item{remainingCount === 1 ? "" : "s"} left • {completionPct}% complete
          </p>
        )}
        {todos.length > 0 && (
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPct}>
            <div className="progress-bar" style={{ width: `${completionPct}%` }} />
          </div>
        )}
      </section>

      <ul className="todo-list" role="list" aria-label="Todo list">
        {filteredTodos.length === 0 && <p>No tasks {filter === "all" ? "yet" : `in ${filter}`} 🎉</p>}
        {filteredTodos.map((todo) => (
          <li key={todo.id} className={todo.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleTodo(todo.id)}
                aria-checked={todo.done}
                aria-label={todo.done ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
              />
              <span className="todo-text">{todo.text}</span>
              {todo.dueDate && (
                <span className="due" aria-label={`Due ${todo.dueDate}`}>
                  • due {todo.dueDate}
                </span>
              )}
              {isOverdue(todo) && <span className="badge overdue">Overdue</span>}
            </label>
            <div className="row-actions">
              <button onClick={() => startEditing(todo)} aria-label={`Edit ${todo.text}`}>✏️</button>
              <button onClick={() => deleteTodo(todo.id)} aria-label={`Delete ${todo.text}`}>❌</button>
            </div>
            {editingId === todo.id && (
              <div className="edit-row">
                <input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={onEditKeyDown}
                  onBlur={saveEditing}
                  aria-label={`Editing ${todo.text}`}
                  autoFocus
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {undoMessage && (
        <div className="snackbar" role="status" aria-live="polite">
          <span>{undoMessage}</span>
          <button onClick={undo} aria-label="Undo last action">Undo</button>
          <button onClick={() => { setUndoStack(null); setUndoMessage(null); }} aria-label="Dismiss">✖︎</button>
        </div>
      )}
    </main>
  );
}

export default App;
