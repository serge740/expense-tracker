/** A delete made on another screen (the detail page) that History offers to undo when it comes back into view. */
let pending: { message: string; trashIds: string[] } | null = null;
export const setPendingUndo = (p: { message: string; trashIds: string[] }) => { pending = p; };
export const takePendingUndo = () => { const p = pending; pending = null; return p; };
