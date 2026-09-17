"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FUND_A, FUND_B, INITIAL_DEVICES, INITIAL_ROOMS, INITIAL_SEATS, SEAT_LINE } from "@/lib/mock-data";
import { clearSession, readRoom, readSession, writeRoom, writeSession } from "@/lib/storage";
import type {
  AuthMethod,
  ChatMessage,
  Device,
  LibraryFile,
  Room,
  RoomId,
  Seat,
  Session,
  Source,
} from "@/lib/types";

interface HatchContextValue {
  ready: boolean;
  session: Session | null;
  currentRoomId: RoomId;
  rooms: Room[];
  visibleRooms: Room[];
  currentRoom: Room;
  threads: Record<string, ChatMessage[]>;
  thread: ChatMessage[];
  streaming: boolean;
  lastSources: Source[] | null;
  lastUsedLibrary: boolean | null;
  seats: Seat[];
  devices: Device[];
  toast: string;
  pairError: string;
  generatedInvite: string;
  emptyRoomsDemo: boolean;
  emptySeatsDemo: boolean;
  setRoom: (id: RoomId) => void;
  pair: (input: { invite: string; totp?: string; device?: string; method: AuthMethod }) => Promise<boolean>;
  signOut: () => void;
  ask: (query: string) => Promise<void>;
  ingest: (filename: string) => void;
  deleteFile: (fileId: string) => void;
  mintInvite: () => void;
  revokeSeat: (id: string) => void;
  grantRooms: (seatId: string, rooms: RoomId[]) => void;
  createRoom: () => void;
  startBackup: () => void;
  importUpdate: () => void;
  resetTotp: () => void;
  setEmptyRoomsDemo: (v: boolean) => void;
  setEmptySeatsDemo: (v: boolean) => void;
  clearToast: () => void;
}

const HatchContext = createContext<HatchContextValue | null>(null);

function cloneRooms(): Room[] {
  return INITIAL_ROOMS.map((room) => ({
    ...room,
    files: room.files.map((file) => ({ ...file })),
  }));
}

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<RoomId>(FUND_A);
  const [rooms, setRooms] = useState<Room[]>(cloneRooms);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({
    [FUND_A]: [],
    [FUND_B]: [],
  });
  const [streaming, setStreaming] = useState(false);
  const [lastSources, setLastSources] = useState<Source[] | null>(null);
  const [lastUsedLibrary, setLastUsedLibrary] = useState<boolean | null>(null);
  const [seats, setSeats] = useState<Seat[]>(INITIAL_SEATS);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [toast, setToast] = useState("");
  const [pairError, setPairError] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState("");
  const [emptyRoomsDemo, setEmptyRoomsDemo] = useState(false);
  const [emptySeatsDemo, setEmptySeatsDemo] = useState(false);
  const [inviteSeq, setInviteSeq] = useState(0);

  useEffect(() => {
    const stored = readSession();
    const room = readRoom();
    if (stored) {
      setSession({
        deviceName: stored.deviceName,
        method: stored.method,
        role: stored.role,
        rooms: stored.rooms,
        pairedAt: new Date().toISOString(),
      });
      setDevices((prev) =>
        prev.map((d) =>
          d.current ? { ...d, name: stored.deviceName, lastSeen: "This session" } : d,
        ),
      );
      const allowed = stored.rooms.includes(room) ? room : stored.rooms[0] || FUND_A;
      setCurrentRoomId(allowed);
    }
    setReady(true);
  }, []);

  const visibleRooms = useMemo(() => {
    if (!session) return rooms;
    return rooms.filter((room) => session.rooms.includes(room.id));
  }, [rooms, session]);

  const currentRoom = useMemo(
    () => rooms.find((r) => r.id === currentRoomId) || rooms[0],
    [rooms, currentRoomId],
  );

  const thread = useMemo(() => threads[currentRoomId] || [], [threads, currentRoomId]);

  const setRoom = useCallback((id: RoomId) => {
    setCurrentRoomId(id);
    writeRoom(id);
  }, []);

  const pair = useCallback(
    async (input: { invite: string; totp?: string; device?: string; method: AuthMethod }) => {
      setPairError("");
      try {
        const res = await fetch("/api/auth/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          error?: string;
          deviceName?: string;
          method?: AuthMethod;
          role?: "Partner" | "Associate";
          rooms?: RoomId[];
        };
        if (!res.ok) {
          setPairError(data.error || "Pairing failed.");
          return false;
        }
        const next: Session = {
          deviceName: data.deviceName || input.device || "This browser",
          method: data.method || input.method,
          role: data.role || "Partner",
          rooms: data.rooms || [FUND_A, "fund-b"],
          pairedAt: new Date().toISOString(),
        };
        writeSession(next);
        setSession(next);
        setDevices((prev) =>
          prev.map((d) =>
            d.current ? { ...d, name: next.deviceName, lastSeen: "This session" } : d,
          ),
        );
        const first = next.rooms[0] || FUND_A;
        setCurrentRoomId(first);
        writeRoom(first);
        return true;
      } catch {
        setPairError("Can’t reach Hatch. Join the office network or the firm VPN, then retry.");
        return false;
      }
    },
    [],
  );

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    setPairError("");
    setToast("");
  }, []);

  const ask = useCallback(
    async (query: string) => {
      if (streaming) return;
      const user: ChatMessage = {
        id: newId("u"),
        role: "user",
        text: query,
        done: true,
        sources: [],
      };
      const assistant: ChatMessage = {
        id: newId("a"),
        role: "assistant",
        text: "",
        done: false,
        sources: [],
      };
      const roomId = currentRoomId;
      setThreads((prev) => ({
        ...prev,
        [roomId]: [...(prev[roomId] || []), user, assistant],
      }));
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, query }),
        });
        if (!res.ok || !res.body) {
          throw new Error("offline");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        let sources: Source[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, "");
            if (!line) continue;
            const payload = JSON.parse(line) as { delta?: string; done?: boolean; sources?: Source[] };
            if (payload.delta) {
              text += payload.delta;
              setThreads((prev) => ({
                ...prev,
                [roomId]: (prev[roomId] || []).map((m) =>
                  m.id === assistant.id ? { ...m, text } : m,
                ),
              }));
            }
            if (payload.done) {
              sources = payload.sources || [];
            }
          }
        }
        setThreads((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || []).map((m) =>
            m.id === assistant.id ? { ...m, text, done: true, sources } : m,
          ),
        }));
        setLastSources(sources);
        setLastUsedLibrary(sources.length > 0);
      } catch {
        setThreads((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || []).map((m) =>
            m.id === assistant.id
              ? {
                  ...m,
                  text: "Can’t reach Hatch. Join the office network or the firm VPN, then retry.",
                  done: true,
                  sources: [],
                }
              : m,
          ),
        }));
        setLastSources([]);
        setLastUsedLibrary(false);
      } finally {
        setStreaming(false);
      }
    },
    [currentRoomId, streaming],
  );

  const ingest = useCallback(
    (filename: string) => {
      const ok = /\.(pdf|docx?|xlsx?|md|txt)$/i.test(filename);
      const kind: LibraryFile["kind"] = /\.pdf$/i.test(filename)
        ? "PDF"
        : /\.md$/i.test(filename)
          ? "Markdown"
          : "Office";
      const rec: LibraryFile = {
        id: newId("up"),
        name: filename,
        kind,
        status: ok ? "queued" : "failed",
        progress: ok ? 15 : 0,
        error: ok ? undefined : "Could not read this file — try PDF or ask Admin.",
        roomId: currentRoomId,
      };
      setRooms((prev) =>
        prev.map((room) =>
          room.id === currentRoomId ? { ...room, files: [rec, ...room.files] } : room,
        ),
      );
      void fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, roomId: currentRoomId }),
      }).catch(() => undefined);
      if (!ok) return;
      window.setTimeout(() => {
        setRooms((prev) =>
          prev.map((room) => ({
            ...room,
            files: room.files.map((f) =>
              f.id === rec.id ? { ...f, status: "extracting", progress: 55 } : f,
            ),
          })),
        );
      }, 700);
      window.setTimeout(() => {
        setRooms((prev) =>
          prev.map((room) => ({
            ...room,
            files: room.files.map((f) =>
              f.id === rec.id ? { ...f, status: "indexed", progress: 90 } : f,
            ),
          })),
        );
      }, 1400);
      window.setTimeout(() => {
        setRooms((prev) =>
          prev.map((room) => ({
            ...room,
            files: room.files.map((f) =>
              f.id === rec.id ? { ...f, status: "ready", progress: 100 } : f,
            ),
          })),
        );
      }, 2000);
    },
    [currentRoomId],
  );

  const deleteFile = useCallback((fileId: string) => {
    setRooms((prev) =>
      prev.map((room) =>
        room.id === currentRoomId
          ? { ...room, files: room.files.filter((f) => f.id !== fileId) }
          : room,
      ),
    );
    setToast("File and chunks removed from this room.");
  }, [currentRoomId]);

  const mintInvite = useCallback(() => {
    setInviteSeq((n) => n + 1);
    const next = inviteSeq + 1;
    const code = emptySeatsDemo && next === 1 ? "HATCH-BETA" : `HATCH-${6 + next}K2M`;
    setGeneratedInvite(code);
    setSeats((prev) => [
      {
        id: newId("seat"),
        name: "Pending invite",
        role: "Seat reserved",
        rooms: [],
        device: code,
        pending: true,
      },
      ...prev,
    ]);
    setToast(`Invite ${code} created. Share it in person. Issued by this box — not emailed from outside the firm.`);
  }, [emptySeatsDemo, inviteSeq]);

  const revokeSeat = useCallback((id: string) => {
    setSeats((prev) => prev.filter((s) => s.id !== id));
    setToast("Seat revoked. The next request from that device will die on this box.");
  }, []);

  const grantRooms = useCallback((seatId: string, nextRooms: RoomId[]) => {
    setSeats((prev) =>
      prev.map((s) => (s.id === seatId ? { ...s, rooms: nextRooms } : s)),
    );
    setToast("Room grants updated. Permission is checked before retrieve.");
  }, []);

  const createRoom = useCallback(() => {
    const id = newId("matter");
    setRooms((prev) => [
      ...prev,
      {
        id,
        name: "New matter",
        isolation: "This room is empty and isolated. It does not search Fund A or Fund B.",
        files: [],
      },
    ]);
    setThreads((prev) => ({ ...prev, [id]: [] }));
    if (session) {
      const nextRooms = [...session.rooms, id];
      const next = { ...session, rooms: nextRooms };
      setSession(next);
      writeSession({
        deviceName: next.deviceName,
        method: next.method,
        role: next.role,
        rooms: nextRooms,
      });
    }
    setCurrentRoomId(id);
    writeRoom(id);
    setToast("Empty room created. This room has no files and no threads.");
  }, [session]);

  const startBackup = useCallback(() => {
    setToast("Backup started (stub). Last success stays 14 Sep 2026 until a real box exists.");
  }, []);

  const importUpdate = useCallback(() => {
    setToast("Waiting for a signed offline bundle. There is no live Hatch remote push.");
  }, []);

  const resetTotp = useCallback(() => {
    setToast("TOTP reset is a stub. On a live box, Admin re-issues the authenticator from this device list.");
  }, []);

  const value = useMemo<HatchContextValue>(
    () => ({
      ready,
      session,
      currentRoomId,
      rooms,
      visibleRooms,
      currentRoom,
      threads,
      thread,
      streaming,
      lastSources,
      lastUsedLibrary,
      seats,
      devices,
      toast,
      pairError,
      generatedInvite,
      emptyRoomsDemo,
      emptySeatsDemo,
      setRoom,
      pair,
      signOut,
      ask,
      ingest,
      deleteFile,
      mintInvite,
      revokeSeat,
      grantRooms,
      createRoom,
      startBackup,
      importUpdate,
      resetTotp,
      setEmptyRoomsDemo,
      setEmptySeatsDemo,
      clearToast: () => setToast(""),
    }),
    [
      ready,
      session,
      currentRoomId,
      rooms,
      visibleRooms,
      currentRoom,
      threads,
      thread,
      streaming,
      lastSources,
      lastUsedLibrary,
      seats,
      devices,
      toast,
      pairError,
      generatedInvite,
      emptyRoomsDemo,
      emptySeatsDemo,
      setRoom,
      pair,
      signOut,
      ask,
      ingest,
      deleteFile,
      mintInvite,
      revokeSeat,
      grantRooms,
      createRoom,
      startBackup,
      importUpdate,
      resetTotp,
    ],
  );

  return <HatchContext.Provider value={value}>{children}</HatchContext.Provider>;
}

export function useHatch() {
  const ctx = useContext(HatchContext);
  if (!ctx) throw new Error("useHatch must be used within AppProvider");
  return ctx;
}

export const seatLine = SEAT_LINE;
