import { VIEW_STORAGE_KEY } from "./view-state";

/**
 * Runs as the HTML is read, before the lists are painted: when this browser
 * has a remembered view, or the address names one, the lists stay hidden
 * until the page has applied it (ScorecardView's layout effect removes the
 * mark), so the server's default order never shows first. With nothing to
 * apply nothing is hidden. If the script cannot run, or the page never
 * hydrates, globals.css shows the lists anyway after a moment.
 */
export const RESTORE_SCRIPT = `try{if(location.hash.length>1||localStorage.getItem(${JSON.stringify(VIEW_STORAGE_KEY)}))document.documentElement.setAttribute("data-sc-restoring","")}catch(e){}`;

