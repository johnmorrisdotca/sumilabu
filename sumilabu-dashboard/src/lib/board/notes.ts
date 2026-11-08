import { prisma } from "@/lib/prisma";

import { noteProblems } from "./rules";
import { resolveTicketId } from "./seq";
import { forgetBoard } from "./ticketCache";

/**
 * Notes (invariant 16) and a ticket's edit history (invariant 15).
 *
 * A note is appended and never edited or deleted, on a ticket in any status,
 * `done` included: it adds beside the release record without rewriting the
 * words invariant 12 freezes. History rows are written by a PATCH, in its own
 * transaction (`server.ts`); this file only reads them.
 */

export type NoteView = { id: string; ticketId: string; body: string; by: string; createdAt: string };

type NoteRow = { id: string; ticketId: string; body: string; by: string; createdAt: Date };

function noteView(row: NoteRow): NoteView {
  return { id: row.id, ticketId: row.ticketId, body: row.body, by: row.by, createdAt: row.createdAt.toISOString() };
}

/** A ticket's notes, oldest first, or null when the ticket is not this project's. */
export async function listTicketNotes(projectKey: string, idOrShortId: string): Promise<NoteView[] | null> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const ticket = await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true } });
  if (!ticket) return null;
  const rows = await prisma.boardTicketNote.findMany({ where: { ticketId, projectKey }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return (rows as NoteRow[]).map(noteView);
}

export type AddNoteOutcome =
  | { ok: true; note: NoteView }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "missing" };

/**
 * Appends one note. The board's reads are dropped afterwards like any other
 * write (`ticketCache.ts`): the notes read carries an ETag from the board's
 * version, so a note that left the version alone would be answered 304.
 */
export async function addTicketNote(projectKey: string, idOrShortId: string, body: string, actor: string): Promise<AddNoteOutcome> {
  const problems = noteProblems(body);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const ticket = await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true } });
  if (!ticket) return { ok: false, reason: "missing" };
  const row = await prisma.boardTicketNote.create({ data: { ticketId, projectKey, body: body.trim(), by: actor } });
  forgetBoard(projectKey);
  return { ok: true, note: noteView(row as NoteRow) };
}

export type EditView = { id: string; field: string; oldValue: string | null; newValue: string | null; editedBy: string; editedAt: string };

type EditRow = { id: string; field: string; oldValue: string | null; newValue: string | null; editedBy: string; createdAt: Date };

/** Every title or detail change of a ticket, oldest first, or null when the ticket is not this project's. */
export async function listTicketHistory(projectKey: string, idOrShortId: string): Promise<EditView[] | null> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const ticket = await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true } });
  if (!ticket) return null;
  const rows = await prisma.boardTicketEdit.findMany({ where: { ticketId, projectKey }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return (rows as EditRow[]).map((row) => ({
    id: row.id,
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    editedBy: row.editedBy,
    editedAt: row.createdAt.toISOString(),
  }));
}
